'use strict'

const crypto = require("crypto");
const oauth = require("oauth");
const EasyXml = require('easyxml');
const xml2js = require('xml2js');
const inflect = require('inflect');

const XERO_BASE_URL = 'https://api.xero.com';
const XERO_API_URL = XERO_BASE_URL + '/api.xro/2.0';


class Xero {
  constructor(key, secret, rsa_key, showXmlAttributes, customHeaders) {
    this.key = key;
    this.secret = secret;
    this.parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: showXmlAttributes !== undefined ? (showXmlAttributes ? false : true) : true, async: true });
    this.oa = new oauth.OAuth(null, null, key, secret, '1.0', null, "PLAINTEXT", null, customHeaders);
    this.oa._signatureMethod = "RSA-SHA1"
    this.oa._createSignature = function(signatureBase, tokenSecret) {
      return crypto.createSign("RSA-SHA1").update(signatureBase).sign(rsa_key, "base64");
    }
  }

  call(method, path, body) {
    let post_body = null;
    let content_type = null;

    return new Promise((resolve, reject) => {
      if (method && method !== 'GET' && body) {
        if (Buffer.isBuffer(body)) {
          post_body = body;
        } else {
          const root = path.match(/([^\/\?]+)/)[1];
          post_body = new EasyXml({ rootElement: inflect.singularize(root), rootArray: root, manifest: true }).render(body);
          content_type = 'application/xml';
        }
      }

      function process(err, xml, res) {
        if (err) {
          return reject(err);
        }

        this.parser.parseString(xml, (err, json) => {
          if (err) return reject(err);
          if (json && json.Response && json.Response.Status !== 'OK') {
            //add meainingful reject if above condition
            return reject(res);
          } else {
            return resolve(json);
          }
        });
      };

      return this.oa._performSecureRequest(this.key, this.secret, method, XERO_API_URL + path, null, post_body, content_type, process);

    });
  }
}

module.exports = Xero;
