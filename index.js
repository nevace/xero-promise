'use strict'

const crypto = require('crypto');
const oauth = require('oauth');
const EasyXml = require('easyxml');
const inflect = require('inflect');

const XERO_API_URL = 'https://api.xero.com/api.xro/2.0/';


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

  call(method, path, body) {
    let postBody;
    let contentType;

    if (method && method !== 'GET' && body) {
      if (Buffer.isBuffer(body)) {
        postBody = body;
      } else {
        const root = path.match(/([^\/\?]+)/)[1];
        postBody = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(body);
        contentType = 'application/xml';
      }
    }

    return new Promise((resolve, reject) => {

      this.oa._performSecureRequest(this.key, this.secret, method, XERO_API_URL + path + '?summarizeErrors=false', null, postBody, contentType, (err, data, res) => {
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
