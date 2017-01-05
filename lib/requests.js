'use strict';

const fetch = require('node-fetch');

class Requests {
	fetch(url, data) {
		return fetch(url, data);
	}

	statusChecker(res) {
		if(res.status >= 200 && res.status < 300) {
			return res;
		} else if(res === 403) {
			// No longer properly authenticated
			this.cookie = null;
			this.auth(null);
			throw new Error('No longer authenticated with TV');
		} else {
			throw new Error('Unable to perform call: ' + res.statusText);
		}
	}

	json(url, headers, data) {
		if(! data) {
			data = headers;
			headers = {};
		}

		headers['Content-Type'] = 'application/json';
		headers['Cookie'] = this.cookie;

		return fetch(url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(data)
		})
		.then(res => this.statusChecker(res))
		.then(res => res.json());
	}

	sendIRCC(url, code) {
		if(! this.cookie) {
			throw new Error('Not authenticated with TV');
		}

		const headers = {
			'Content-Type': 'text/xml; charset=UTF-8',
			'SOAPACTION': '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
			'Cookie': this.cookie
		};

		const body = '<?xml version="1.0"?>' +
			'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
				'<s:Body>' +
					'<u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
						'<IRCCCode>' + code + '</IRCCCode>' +
					'</u:X_SendIRCC>' +
				'</s:Body>' +
			'</s:Envelope>';

		return fetch(url, {
			method: 'POST',
			headers: headers,
			body: body
		}).then(res => this.statusChecker(res));
	}
}

module.exports = Requests;
