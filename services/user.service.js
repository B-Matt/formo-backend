"use strict";

// TODO: Dodati upload profilne slike usera kao file!! (To multithreadat)

const jwt = require("jsonwebtoken");
const { MoleculerClientError } = require("moleculer").Errors;
const bcrypt = require("bcryptjs");

// Database Mixins
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */
module.exports = {
	name: "user",
	mixins: [
		DbService("users"),
		CacheCleanerMixin([
			"cache.clean.users"
		])
	],

	/**
	 * Settings
	 */
	settings: {
		rest: "/",
		JWT_SECRET: process.env.JWT_SECRET || "jwt_formo_token",
		fields: ["_id", "name", "email", "sex", "organisation", "tasks", "projects", "settings"],
		entityValidator: {
			name: { type: "string", min: 2 },
			password: { type: "string", min: 6 },
			email: { type: "email" },
			sex: { type: "string", optional: true },
			organisation: { type: "object", optional: true },
			tasks: { type: "array", items: "object", optional: true },
			projects: { type: "array", items: "object", optional: true },
			settings: { type: "array", items: "object" }
		}
	},

	/**
	 * Dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Logins with e-mail & password.
		 *
		 * @actions
		 * @param {Object} user - User credentials
		 *
		 * @returns {Object} Logged in user with token
		 */
		login: {
			rest: "POST /user/login",
			params: {
				user: {
					type: "object", props: {
						email: { type: "email" },
						password: { type: "string", min: 6 }
					}
				}
			},
			async handler(ctx) {
				const { email, password } = ctx.params.user;
				const user = await this.adapter.findOne({ email });
				if(!user) throw new MoleculerClientError("E-Mail or Password is invalid!", 422);

				const passCompare = await bcrypt.compare(password, user.password);
				if(!passCompare) throw new MoleculerClientError("Password is not matching user with provided e-mail!", 422);

				const doc = await this.transformDocuments(ctx, {}, user);
				return await this.transformEntity(doc, true, ctx.meta.token);
			},
		},

		/**
		 * Registers a new user.
		 *
		 * @actions
		 * @param {Object} user - User entity
		 *
		 * @returns {Object} Created entity & token
		 */
		create: {
			rest: "POST /user",
			params: {
				user: { type: "object" }
			},
			async handler(ctx) {
				const user = ctx.params.user;
				await this.validateEntity(user);

				if(user.email) {
					const isEmailExists = await this.adapter.findOne({ email: user.email });
					if(isEmailExists) throw new MoleculerClientError("User with that e-mail already exists!", 422);
				}

				user.password = bcrypt.hashSync(user.password, 10);
				user.sex = user.sex || "male";
				user.organisation = user.organisation || null;
				user.tasks = user.tasks || [];
				user.projects = user.projects || [];
				user.settings = user.settings || [];

				const doc = await this.adapter.insert(user);
				const transDoc = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(transDoc, true, ctx.meta.token);
				await this.entityChanged("created", json, ctx);
				return json;
			}
		},

		/**
		 * Updates User entity.
		 * Auth is required!
		 *
		 * @actions
		 *
		 * @returns {Object} Updated User entity
		 */
		update: {
			auth: "required",
			rest: "PATCH /user",
			params: {
				user: { type: "object", props: {
					name: { type: "string", min: 2, optional: true },
					password: { type: "string", min: 6, optional: true },
					email: { type: "email", optional: true },
					sex: { type: "string", optional: true },
					taks: { type: "array", items: "object", optional: true },
					organisation: { type: "array", items: "object", optional: true },
					projects: { type: "array", items: "object", optional: true },
					settings: { type: "array", items: "object", optional: true },
				} }
			},
			async handler(ctx) {
				const data = ctx.params.user;

				if(data.name) {
					const foundUser = await this.adapter.findOne({ name: data.name });
					if(foundUser && foundUser._id.toString() !== ctx.meta.user._id.toString()) 
						throw new MoleculerClientError("User with that name already exists!", 422);
				}
				if(data.email) {
					const foundUser = await this.adapter.findOne({ name: data.name });
					if(foundUser && foundUser._id.toString() !== ctx.meta.user._id.toString()) 
						throw new MoleculerClientError("User with that e-mail already exists!", 422);
				}

				data.password = bcrypt.hashSync(data.password, 10);
				data.updatedAt = new Date();

				const doc = await this.adapter.updateById(ctx.meta.user._id, { "$set": data });
				const user = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(user, true, ctx.meta.token);
				await this.entityChanged("updated", json, ctx);
				return json;
			}
		},

		/**
		 * Returns list of User entities inside DB.
		 */
		list: {
			rest: "GET /user"
		},

		/**
		 * Returns User entity based on provided entity ID.
		 */
		get: {
			rest: "GET /user/:id",
			auth: "required"
		},

		/**
		 * Returns Users that are inside provided organisation.
		 */
		getbyOrg: {
			rest: "GET /user/org/:org",
			params: {
				org: { type: "string" },
			},
			auth: "required",
			async handler(ctx) {
				const users = await this.adapter.find({ query: { organisation: ctx.params.org } });
				if (!users) throw new MoleculerClientError("Users with provided organisation ID not found!", 404);
				return users;
			},
		},

		/**
		 * Removes User entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /user/:id",
			auth: "required"
		},

		/**
		 * Resolves and gets user by JWT.
		 */
		resolveToken: {
			cache: {
				keys: ["token"],
				ttl: 60 * 60, // 1 hour
			},
			params: {
				token: "string",
			},
			async handler(ctx) {
				const decoded = await new this.Promise((resolve, reject) => {
					jwt.verify(ctx.params.token, this.settings.JWT_SECRET, (err, decoded) => {
						if (err) return reject(err);
						resolve(decoded);
					});
				});
				if (decoded.id) return this.getById(decoded.id);
			}
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
		/**
		 * Generate a JWT token from user entity
		 *
		 * @param {Object} user
		 */
		generateJWT(user) {
			const today = new Date();
			const exp = new Date(today);
			exp.setDate(today.getDate() + 1);

			return jwt.sign({
				id: user._id,
				username: user.username,
				exp: Math.floor(exp.getTime() / 1000)
			}, this.settings.JWT_SECRET);
		},

		/**
		 * Transform returned user entity. Generate JWT token if neccessary.
		 *
		 * @param {Object} user
		 * @param {Boolean} withToken
		 */
		transformEntity(user, withToken, token) {
			if (user && withToken) {
				user.token = token || this.generateJWT(user);
			}
			return { user };
		}
	}
};
