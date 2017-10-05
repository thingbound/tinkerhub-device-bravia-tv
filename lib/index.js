'use strict';

const Device = require('./device');
const browser = require('tinkerhub-upnp')
	.browser('urn:schemas-sony-com:service:IRCC:1');

const devices = {};

browser.on('available', function(device) {
	if(devices[device.UDN]) {
		devices[device.UDN]._remove();
	}

	let services = {};
	device.services.forEach(s => {
		switch(s.type) {
			case 'urn:schemas-sony-com:service:ScalarWebAPI:1':
				services['scalar'] = {
					url: s.controlURL
				};
				break;
			case 'urn:schemas-sony-com:service:IRCC:1':
				services['ircc'] = {
					url: s.controlURL
				};
				break;
		}
	});

	if(! services['scalar'] || ! services['ircc']) {
		return;
	}

	try {
		const d = devices[device.UDN] = new Device(device, services);
		d.register();
	} catch(ex) {
		console.log(ex);
	}
});

browser.on('unavailable', function(device) {
	const d = devices[device.UDN];
	if(d) d.remove();
});
