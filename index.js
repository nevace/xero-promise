'use strict';

const crypto = require('crypto');
const oauth = require('oauth');
const EasyXml = require('easyxml');
const inflect = require('inflect');
const querystring = require('querystring');
const co = require('co');
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
      const root = path.match(/([^\/\?]+)/)[1];
      const promises = [];
      //get average size of individual xml doc and work out batch number

      //batch
      postBody = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(body);
      contentType = 'application/xml';

      params = params ? `?${querystring.stringify(params)}` : '';

      if (batchedData) {
        for (let data of batchedData) {
          promises.push(this._request(method, fullPath, params, data, contentType));
        }
        return Promise.all(promises);
      } else {
        return this._request(method, fullPath, params, data, contentType);
      }

    } else {
      //GET request with no params or no page param
      if (!params || !params.page) {

        return co(function*() {
          let pageNo = 1;
          let result;
          let fullResult = [];
          params = params ? `?${querystring.stringify(params)}&page=` : '?page=';

          result = yield this._request(method, fullPath, params + pageNo, postBody, contentType);
          fullResult.push(...result[path]);

          while (result[path].length) {
            pageNo++;
            fullResult.push(...result[path]);
            result = yield this._request(method, fullPath, params + pageNo, postBody, contentType);
          }
          return fullResult;
        }.bind(this));

      } else {
        //GET request with page param
        params = `?${querystring.stringify(params)}`;
        return this._request(method, fullPath, params, postBody, contentType);
      }
    }
  }

  _request(method, fullPath, params, postBody, contentType) {
    return new Promise((resolve, reject) => {
      console.log(`${method} ${fullPath + params}`);
      this.oa._performSecureRequest(this.key, this.secret, method, fullPath + params, null, postBody, contentType, (err, data, res) => {
        if (err) {
          try {
            err.data = JSON.parse(err.data);
            return resolve(err);
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
}

module.exports = Xero;
