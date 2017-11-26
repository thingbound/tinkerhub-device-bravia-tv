'use strict';

const { Appliance, State, SwitchablePower, Storage } = require('appliances');

const Requests = require('./requests');

const html = require('html-entities').AllHtmlEntities;
const kebabCase = require('lodash.kebabcase');

module.exports = class BraviaTV extends Appliance.with(State, SwitchablePower, Storage) {
	static get availableAPI() {
		return [
			'authenticate',
			'command',
			'commands',
			'applications',
			'launchApplication',
			'sources',
			'braviaInspect'
		];
	}

	static get types() {
		return [ 'bravia-tv', 'tv' ];
	}

	constructor(root, services) {
		super();

		this._services = services;
		this.metadata.name = root.friendlyName;

		this.id = root.UDN;

		this._requests = new Requests();
		this._requests.auth = cookie => {
			this.updateState('authenticated', !! cookie);
			this.storage.set('cookie', null);
		};

		this._poll = setInterval(this._update.bind(this), 10000);
		this._update();
	}

	init() {
		return super.init()
			.then(() => this.storage.get('cookie'))
			.then(cookie => {
				this._requests.cookie = cookie;
				this.updateState('authenticated', !! cookie);
			})
			.then(() => {
				this._commands = {};
				// Get all of the commands this TV supports
				return this._scalar('system', 'getRemoteControllerInfo', '1.0', [])
					.then(result => {
						result[1].forEach(cmd => {
							this._commands[kebabCase(cmd.name)] = cmd.value;
						});
					});
			})
			.then(() => this);
	}

	destroy() {
		clearInterval(this._poll);
		super.destroy();
	}

	_update() {
		if(this._updating) return;

		this._updating = true;
		this._requests.json(
			this._services.scalar + '/system',
			{
				'id': 2,
				'method': 'getPowerStatus',
				'version': '1.0',
				'params': []
			}
		).then(s => {
			this._updating = false;
			const result = s.result[0];

			this.updatePower(result.status == 'active');
		}, () => {
			this._updating = false
			this.updatePower(false);
		});
	}

	authenticate(code) {
		const headers = {
			'Content-Type': 'application/json'
		};
		if(code) {
			headers['Authorization'] = 'Basic ' + Buffer.from(':' + code).toString('base64');
		}

		return this._requests.fetch(
			this._services.scalar + '/accessControl',
			{
				method: 'POST',
				headers: headers,
				body: JSON.stringify({
					id: 1,
					method: 'actRegister',
					version: '1.0',
					params: [
						{
							clientid: 'tinkerhub',
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
				if(! code) {
					return 'Call authenticate with code displayed on TV';
				}

				throw new Error('Unable to authenticate, the wrong code was probably entered');
			}

			const c = r.headers.get('Set-Cookie');
			if(c) {
				this._requests.cookie = c.split(';')[0];
				return this.storage.set('cookie', this._requests.cookie)
					.then(() => {
						this.updateState('authenticated', true);
						return 'Authenticated with TV';
					});
			}

			return 'Call authenticate with code displayed on TV';
		});
	}

	_scalar(endpoint, method, version, params) {
		return this._requests.json(
			this._services.scalar + '/' + endpoint,
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

	changePower(power) {
		return this._scalar('system', 'setPowerStatus', '1.0', {
			status: power
		}).then(() => this.updatePower(power));
	}

	command(ircc) {
		let url = this._services.ircc;
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
					let id = title.replace(/\s+/g, '-').toLowerCase();
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

	test(id) {
		return this._scalar('avContent', 'getPlayingContentInfo', '1.0', {
		});
	}

	sources() {
		return this._scalar('avContent', 'getSchemeList', '1.0', [])
			.then(schemes => {
				return mapSeries(schemes[0], o => {
					return this._scalar('avContent', 'getSourceList', '1.0', {
						scheme: o.scheme
					})
						.then(sources => sources[0]);
				});
			});
	}

	braviaInspect() {
		const data = {};
		return this._scalar('guide', 'getServiceProtocols', '1.0', [])
			.then(results => {
				return mapSeries(results, id => this._braviaInspectServiceProtocol(id[0])
					.then(methods => {
						data[id[0]] = methods;
					})
				);
			})
			.then(() => data);
	}

	_braviaInspectServiceProtocol(id) {
		const data = [];
		return this._scalar(id, 'getVersions', '1.0', [])
			.then(results => {
				let versions = results[0];
				return mapSeries(versions, v => {
					return this._scalar(id, 'getMethodTypes', '1.0', [ v ])
						.then(methods => {
							methods.forEach(m => data.push({
								name: m[0],
								version: v,
								returnType: m[2],
								arguments: m[1]
							}));
						});
				});
			}).then(() => {
				return data;
			})
			.catch(e => {
				return 'Could not fetch methods';
			});
	}
}

function mapSeries(array, fn) {
	let current = Promise.resolve();
	const results = [];
	array.forEach((v, i) =>
		current = results[i] = current.then(() => {
			return fn(array[i]);
		})
	);

	return Promise.all(results);
}
