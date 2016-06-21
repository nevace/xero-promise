'use strict';

const crypto = require('crypto');
const oauth = require('oauth');
const EasyXml = require('easyxml');
const inflect = require('inflect');
const querystring = require('querystring');
const co = require('co');
const converter = require('byte-converter').converterBase2;
const xeroApiUrl = 'https://api.xero.com/api.xro/2.0/';


class Xero {
  constructor(key, secret, rsaKey, customHeaders) {
    this.key = key;
    this.secret = secret;
    this.oa = new oauth.OAuth(null, null, key, secret, '1.0', null, 'PLAINTEXT', null, customHeaders);
    this.oa._signatureMethod = 'RSA-SHA1';
    this.oa._createSignature = function(signatureBase, tokenSecret) {
      return crypto.createSign('RSA-SHA1').update(signatureBase).sign(rsaKey, 'base64');
    };
  }

  call(method, path, body, params) {
    const fullPath = xeroApiUrl + path;
    let postBody;
    let contentType;
    params = params || '';

    if (method && method !== 'GET' && body) {
      return this._post(method, fullPath, params, postBody, contentType, path, body);
    } else {
      //GET request with no params or no page param
      if (!params || !params.page) {
        return this._getAll(method, fullPath, params, postBody, contentType, path);
      } else {
        //GET request with page param
        params = `?${querystring.stringify(params)}`;
        return this._request(method, fullPath, params, postBody, contentType);
      }
    }
  }

  _post(method, fullPath, params, postBody, contentType, path, body) {
    const root = path.match(/([^\/\?]+)/)[1];
    contentType = 'application/xml';
    postBody = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(body);
    params = params ? `?${querystring.stringify(params)}` : '';
    //multiply the size by 2 as Xero states a 50% increase after encoded
    const postBodyMb = converter(Buffer.byteLength(postBody) * 2, 'B', 'MB');

    //xero size limit is 3.5mb, batch into 3mb to be safe
    if (postBodyMb > 3) {
      console.log('postbody more than 3mb')
      const batchSize = Math.ceil(postBodyMb / 3);
      const batchedArrayByNumber = this._splitArrayByNumber(body, batchSize);

      return this._postBatch(method, fullPath, params, contentType, path, batchedArrayByNumber);
    } else {
      if (body.length > 200) {
        console.log('small size but over 200')
        return this._postBatch(method, fullPath, params, contentType, path, body);
      }
      console.log('small size')
      return this._request(method, fullPath, params, postBody, contentType);
    }
  }

  _postBatch(method, fullPath, params, contentType, path, data) {
    return co(function*() {
      const root = path.match(/([^\/\?]+)/)[1];
      const batchSize = 200;
      let batchCount = data.length;
      let i = 0;
      let result;
      let fullResult = [];

      //data thats batched into small chunks but still has many elements per chunk
      if (Array.isArray(data[0]) && data[0].length > 200) {
        console.log('batched into even sizes, more than 200')
        for (let firstbatch of data) {
          let j = 0;
          let subBatch = this._splitArrayBySize(firstbatch, batchSize);
          i++;

          for (let batch of subBatch) {
            j++;
            let data = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(batch);
            result = yield this._request(method, fullPath, params, data, contentType, { batchNo: i, batchCount: batchCount, subBatchNo: j, subBatchCount: subBatch.length });
            fullResult.push(...result[path]);
          }
        }

      } else {

        //batch data thats small in size but large in element number
        if (!Array.isArray(data[0])) {
          console.log('small size but over 200')
          data = this._splitArrayBySize(data, batchSize);
        }

        for (let batch of data) {
          i++;
          let xmlData = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(batch);
          result = yield this._request(method, fullPath, params, xmlData, contentType, { batchNo: i, batchCount: data.length });
          fullResult.push(...result[path]);
        }
      }
      return fullResult;
    }.bind(this));
  }

  _getAll(method, fullPath, params, postBody, contentType, path) {
    return co(function*() {
      let pageNo = 1;
      let result;
      let fullResult = [];
      params = params ? `?${querystring.stringify(params)}&page=` : '?page=';

      result = yield this._request(method, fullPath, params + pageNo, postBody, contentType);
      fullResult.push(...result[path]);

      while (result[path].length) {
        pageNo++;
        result = yield this._request(method, fullPath, params + pageNo, postBody, contentType);
        fullResult.push(...result[path]);
      }
      return fullResult;
    }.bind(this));
  }

  _request(method, fullPath, params, postBody, contentType, batch) {
    let batchLog = batch ? `batch ${batch.batchNo} of ${batch.batchCount}` : '';
    batchLog += batch && batch.subBatchNo ? `, sub-batch ${batch.subBatchNo} of ${batch.subBatchCount}` : '';
    const log = `${method} ${fullPath}${params} ${batchLog}`;
    return new Promise((resolve, reject) => {
      console.log(log);
      this.oa._performSecureRequest(this.key, this.secret, method, fullPath + params, null, postBody, contentType, (err, data, res) => {
        if (err) {
          try {
            err.data = JSON.parse(err.data);
            return reject(err);
          } catch (e) {
            return reject(err);
          }
        }
        try {
          const json = JSON.parse(data);
          return resolve(json);
        } catch (e) {
          return resolve(data);
        }
      });
    });
  }

  _splitArrayByNumber(array, n) {
    if (n < 2) return [array];

    const len = array.length;
    const out = [];
    let i = 0;
    let size;

    if (len % n === 0) {
      size = Math.floor(len / n);
      while (i < len) {
        out.push(array.slice(i, i += size));
      }
    } else {
      n--;
      size = Math.floor(len / n);

      if (len % size === 0) {
        size--;
      }

      while (i < size * n) {
        out.push(array.slice(i, i += size));
      }
      out.push(array.slice(size * n));
    }

    return out;
  }

  _splitArrayBySize(array, n) {
    const out = [];

    for (let i = 0, len = array.length; i < len; i += n) {
      out.push(array.slice(i, i + n));
    }
    return out;
  }

}

module.exports = Xero;
