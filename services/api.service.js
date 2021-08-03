"use strict";

const ApiGateway = require("moleculer-web");
const { UnAuthorizedError, ERR_NO_TOKEN, ERR_INVALID_TOKEN } = require("moleculer-web/src/errors");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 * @typedef {import('http').IncomingMessage} IncomingRequest Incoming HTTP Request
 * @typedef {import('http').ServerResponse} ServerResponse HTTP Server Response
 */

module.exports = {
	name: "api",
	mixins: [ApiGateway],

	// More info about settings: https://moleculer.services/docs/0.14/moleculer-web.html
	settings: {
		// Exposed port
		port: process.env.PORT || 5000,

		// Exposed IP
		ip: "0.0.0.0",

		// Global Express middlewares. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Middlewares
		use: [],

		routes: [
			{
				path: "/api",

				whitelist: [
					"**"
				],

				// Route-level Express middlewares. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Middlewares
				use: [],

				// Enable/disable parameter merging method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Disable-merging
				mergeParams: true,

				// Enable authentication. Implement the logic into `authenticate` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authentication
				authentication: false,

				// Enable authorization. Implement the logic into `authorize` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authorization
				authorization: true,

				// The auto-alias feature allows you to declare your route alias directly in your services.
				// The gateway will dynamically build the full routes from service schema.
				autoAliases: true,

				aliases: {
				},

				// Calling options. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Calling-options
				callingOptions: {},

				bodyParsers: {
					json: {
						strict: false,
						limit: "1MB"
					},
					urlencoded: {
						extended: true,
						limit: "1MB"
					}
				},

				// Mapping policy setting. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Mapping-policy
				mappingPolicy: "all", // Available values: "all", "restrict"

				// Enable/disable logging
				logging: true
			},
			{
				path: "/upload",

				aliases: {
                    "POST /": "multipart:task.attachments.save",
                    "PUT /": "stream:task.attachments.save",
                    "PUT /:id": "stream:task.attachments.save",
                    "POST /file/:id": {
                        type: "multipart",
                        busboyConfig: {
							limits: {
								files: 1
							},
							onPartsLimit(busboy, alias, svc) {
								this.logger.info("Busboy parts limit!", busboy);
							},
							onFilesLimit(busboy, alias, svc) {
								this.logger.info("Busboy file limit!", busboy);
							},
							onFieldsLimit(busboy, alias, svc) {
								this.logger.info("Busboy fields limit!", busboy);
							}
						},
						action: "task.attachments.save"
                    },
                    "POST /files": {
						type: "multipart",
						busboyConfig: {
							limits: {
								files: 3,
								fileSize: 1 * 1024 * 1024
							},
							onPartsLimit(busboy, alias, svc) {
								this.logger.info("Busboy parts limit!", busboy);
							},
							onFilesLimit(busboy, alias, svc) {
								this.logger.info("Busboy file limit!", busboy);
							},
							onFieldsLimit(busboy, alias, svc) {
								this.logger.info("Busboy fields limit!", busboy);
							}
						},
						action: "task.attachments.save"
					},
					"GET /:task/:file": "task.attachments.get",
					"DELETE /:task/:file": "task.attachments.remove"
                },

				bodyParsers: {
                    json: false,
                    urlencoded: false
                },

				busboyConfig: {
					limits: {
						files: 1
					}
				},

				mappingPolicy: "restrict"
			}
		],

		// Global CORS settings
		cors: {
			origin: "*",
			methods: ["GET", "OPTIONS", "POST", "PATCH", "PUT", "DELETE"],
			allowedHeaders: "*",
			//exposedHeaders: "*",
			credentials: true,
			maxAge: null
		},

		// Rate limiter
		rateLimit: {
			window: 10 * 1000,
			limit: 10,
			headers: true
		},

		// Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
		log4XXResponses: false,
		// Logging the request parameters. Set to any log level to enable it. E.g. "info"
		logRequestParams: null,
		// Logging the response data. Set to any log level to enable it. E.g. "info"
		logResponseData: null,

		// Serve assets from "public" folder. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Serve-static-files
		assets: {
			folder: "public",

			// Options to `server-static` module
			options: {}
		}
	},

	methods: {
		/**
		 * Authorize the request. Check that the authenticated user has right to access the resource.
		 *
		 * @param {Context} ctx
		 * @param {Object} route
		 * @param {IncomingRequest} req
		 * @returns {Promise}
		 */
		async authorize(ctx, route, req) {
			let token;
			if (req.headers.authorization) {
				let type = req.headers.authorization.split(" ")[0];
				if (type === "Token" || type === "Bearer")
					token = req.headers.authorization.split(" ")[1];
			}
			
			if (req.$action.auth == "required" && !token) {
				return Promise.reject(new UnAuthorizedError(ERR_NO_TOKEN));
			}

			// Verify JWT token
			let user;
			if(token) {
				user = await ctx.call("user.resolveToken", { token });
				if (req.$action.auth == "required" && !user) return Promise.reject(new UnAuthorizedError(ERR_INVALID_TOKEN));
				ctx.meta.user = user;
				ctx.meta.token = token;
				ctx.meta.url = req.headers.referer;
			}
			
			if (req.$action.auth == "required" && !user)
				throw new UnAuthorizedError();
		}

	}
};
