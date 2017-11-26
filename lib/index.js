'use strict';

const th = require('tinkerhub');
const BraviaTV = require('./tv');
const browser = require('tinkerhub-upnp')
	.browser('urn:schemas-sony-com:service:IRCC:1')
	.map(device => {
		let services = {};
		device.services.forEach(s => {
			switch(s.type) {
				case 'urn:schemas-sony-com:service:ScalarWebAPI:1':
					services.scalar = s.controlURL;
					break;
				case 'urn:schemas-sony-com:service:IRCC:1':
					services.ircc = s.controlURL;
					break;
			}
		});

		if(! services.scalar || ! services.ircc) {
			return;
		}

		return new BraviaTV(device, services)
			.init();
	});

th.registerDiscovery(browser);
