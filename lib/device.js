'use strict';

const th = require('tinkerhub');
const Requests = require('./requests');

const html = require('html-entities').AllHtmlEntities;
const kebabCase = require('lodash.kebabcase');

class Device {
	constructor(root, services) {
		this._services = services;

		this.metadata = {
			type: [ 'bravia-tv', 'tv' ],
			capabilities: [ 'state', 'power' ],
			name: root.friendlyName
		};

		this.state = {
			authenticated: false,
			power: false
		};

		this._handle = th.devices.register(root.UDN, this);
		this._storage = th.storage.sub('device.' + root.UDN);

		this._requests = new Requests();
		this._requests.cookie = this._storage.get('cookie');
		this._requests.auth = cookie => {
			this.state.authenticated = !! cookie;
		};

		if(this._requests.cookie) {
			this.state.authenticated = true;
		}

		this._poll = setInterval(this._update.bind(this), 10000);
		this._update();

		this._commands = {};
		// Get all of the commands this TV supports
		this._scalar('system', 'getRemoteControllerInfo', '1.0', [])
			.then(result => {
				result[1].forEach(cmd => {
					this._commands[kebabCase(cmd.name)] = cmd.value;
				});
			});
	}

	_remove() {
		clearInterval(this._poll);
		this._handle.remove();
	}

	_update() {
		if(this._updating) return;

		this._updating = true;
		this._requests.json(
			this._services.scalar.url + '/system',
			{
				'id': 2,
				'method': 'getPowerStatus',
				'version': '1.0',
				'params': []
			}
		).then(s => {
			this._updating = false;
			const result = s.result[0];

			this._switchPower(result.status == 'active');
		}, () => {
			this._updating = false
			this._switchPower(false);
		});
	}

	_switchPower(power) {
		const emitEvent = this.state.power != power;
		this.state.power = power;

		if(emitEvent) {
			this._handle.emit('power', power);
			this._handle.emit('state', this.state);
		}

		return power;
	}

	authenticate(code) {
		const headers = {
			'Content-Type': 'application/json'
		};
		if(code) {
			headers['Authorization'] = 'Basic ' + Buffer.from(':' + code).toString('base64');
		}

		return this._requests.fetch(
			this._services.scalar.url + '/accessControl',
			{
				method: 'POST',
				headers: headers,
				body: JSON.stringify({
					id: 1,
					method: 'actRegister',
					version: '1.0',
					params: [
						{
							clientid: 'th:' + th.storage.machineId,
							nickname: 'Tinkerhub',
							level: 'private'
						},
						[
							{
								value: 'yes',
								function: 'WOL'
							}
						]
					]
				})
			}
		).then(r => {
			if(r.status != 200) {
				throw new Error('Unable to authenticate, the wrong code was probably entered');
			}

			const c = r.headers.get('Set-Cookie');
			if(c) {
				this._requests.cookie = c.split(';')[0];
				this._storage.put('cookie', this._requests.cookie);
				this.state.authenticated = true;
				return 'Authenticated with TV';
			}
			return 'Call authenticate with code displayed on TV';
		});
	}

	_scalar(endpoint, method, version, params) {
		return this._requests.json(
			this._services.scalar.url + '/' + endpoint,
			{
				id: 2,
				method: method,
				version: version,
				params: Array.isArray(params) ? params : [ params ]
			}
		).then(v => {
			if(v.error) {
				throw new Error('Error, server said: ' + JSON.stringify(v.error));
			}
			return v.result || v.results;
		});
	}

	power(power) {
		if(typeof power !== 'undefined') {
			return this.setPower(power);
		}

		return this.state.power;
	}

	setPower(power) {
		return this._scalar('system', 'setPowerStatus', '1.0', {
			status: power
		}).then(() => this._switchPower(power));
	}

	turnOn() {
		return this.setPower(true);
	}

	turnOff() {
		return this.setPower(false);
	}

	command(ircc) {
		let url = this._services['ircc'].url;
		let code = this._commands[ircc];
		if(! code) {
			throw new Error('Unsupported command: ' + ircc);
		}
		return this._requests.sendIRCC(url, code)
			.then(() => true);
	}

	commands() {
		return Object.keys(this._commands);
	}

	applications() {
		if(this._applications) {
			return this._applications;
		}

		return this._scalar('appControl', 'getApplicationList', '1.0', [])
			.then(results => {
				const ids = {};
				return this._applications = results[0].map(r => {
					const title = html.decode(r.title);

					// Find a free identifier
					let id = kebabCase(title);
					while(ids[id]) {
						id += '_';
					}

					ids[id] = true;

					return {
						id: id,
						name: title,
						icon: r.icon,
						uri: r.uri
					};
				});
			});
	}

	launchApplication(id) {
		return this._handle.call('applications', [])
			.then(apps => {
				let app = apps.find(a => a.id === id);
				if(! app) {
					return false;
				}

				return this._scalar('appControl', 'setActiveApp', '1.0', {
					uri: app.uri,
					data: null
				}).then(() => true);
			});
	}
}

module.exports = Device;
