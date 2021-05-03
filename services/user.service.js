"use strict";

const jwt = require("jsonwebtoken");
const _ = require("lodash");
const { MoleculerError } = require("moleculer").Errors;
const { promisify } = require("util");

const JWT_SECRET = "jwt_formo_token";

// Fake Data
const users = [{ id: 1, username: "admin", password: "admin", role: "admin" }];

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */
module.exports = {
	name: "user",

	/**
	 * Settings
	 */
	settings: {},

	/**
	 * Dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Login action.
		 *
		 * Required params:
		 * 	- 'username'
		 *  - 'password'
		 *
		 * @param {any} ctx
		 * @returns
		 */
		login: {
			rest: "POST /login",
			params: {
				username: { type: "string" },
				password: { type: "string", min: 5 },
			},
			handler(ctx) {
				let user = users.find(
					(u) =>
						u.username == ctx.params.username &&
						u.password == ctx.params.password
				);
				if (user) {
					return this.generateToken(user).then((token) => {
						return { token, user };
					});
				} else {
					return Promise.reject(
						new MoleculerError("Invalid credentials", 400)
					);
				}
			},
		},

		/**
		 * Verify a JWT token
		 *
		 * @param {any} ctx
		 * @returns
		 */
		verifyToken(ctx) {
			return this.verify(ctx.params.token, JWT_SECRET);
		},

		/**
		 * Get User entity by ID
		 *
		 * @param {any} ctx
		 * @returns
		 */
		getUserByID(ctx) {
			return users.find((u) => u.id == ctx.params.id);
		},

		resolveToken: { // Ovo prebaciti u await
			cache: {
				keys: ["token"],
				ttl: 60 * 60, // 1 hour
			},
			params: {
				token: "string",
			},
			handler(ctx) {
				return new this.Promise((resolve, reject) => {
					jwt.verify(ctx.params.token, JWT_SECRET, (err, decoded) => {
						if (err) {
							return reject(err);
						}
						resolve(decoded);
					});
				}).then((decoded) => {
					if (decoded.id) {
						return users.find((u) => u.id == decoded.id);
					}
				});
			},
		},
	},

	/**
	 * Events
	 */
	events: {},

	/**
	 * Methods
	 */
	methods: {
		generateToken(user) {
			return this.encode(_.pick(user, ["id", "role"]), JWT_SECRET);
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {
		// Create Promisify encode & verify methods
		this.encode = promisify(jwt.sign);
		this.verify = promisify(jwt.verify);
	},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {},
};
