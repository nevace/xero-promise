'use strict'

const crypto = require('crypto');
const oauth = require('oauth');
const EasyXml = require('easyxml');
const xml2js = require('xml2js');
const inflect = require('inflect');

const XERO_BASE_URL = 'https://api.xero.com';
const XERO_API_URL = `${XERO_BASE_URL}/api.xro/2.0`;


class Xero {
  constructor(key, secret, rsaKey, showXmlAttributes, customHeaders) {
    this.key = key;
    this.secret = secret;
    this.parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: showXmlAttributes !== undefined ? (showXmlAttributes ? false : true) : true, async: true });
    this.oa = new oauth.OAuth(null, null, key, secret, '1.0', null, 'PLAINTEXT', null, customHeaders);
    this.oa._signatureMethod = 'RSA-SHA1';
    this.oa._createSignature = function(signatureBase, tokenSecret) {
      return crypto.createSign('RSA-SHA1').update(signatureBase).sign(rsaKey, 'base64');
    };
  }

  call(method, path, body) {
    let postBody = null;
    let contentType = null;

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

      this.oa._performSecureRequest(this.key, this.secret, method, XERO_API_URL + path + '?summarizeErrors=false', null, postBody, contentType, function(err, data, res) {
        if (err) {
          try {
            err.data = JSON.parse(err.data);
            return reject(err);
          } catch (e) {
            return reject(err);
          }
        }
        data = (typeof data === 'string') ? JSON.parse(data) : data;
        return resolve(data);
      });
    });
  }
}

module.exports = Xero;
