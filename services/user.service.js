"use strict";

const _ = require('lodash');
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { MoleculerClientError } = require("moleculer").Errors;
const bcrypt = require("bcryptjs");
const C = require("../constants");

// Database Mixins
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

// Constants
const TOKEN_EXPIRATION = 60 * 60 * 1000; // 1 hour

/**
 * User service
 */
module.exports = {
	name: "user",
	mixins: [
		DbService("users"),
		CacheCleanerMixin([ "cache.clean.users" ])
	],

	/**
	 * Settings
	 */
	settings: {
		rest: "/",
		JWT_SECRET: process.env.JWT_SECRET || "jwt_formo_token",
		fields: ["_id", "firstName", "lastName", "email", "role", "sex", "organisation", "projects", "settings"],
		entityValidator: {
			firstName: { type: "string", min: 2 },
			lastName: { type: "string", min: 2 },
			password: { type: "string", min: 6, optional: true },
			email: { type: "email" },
			role: { type: "enum", values: C.USER_ROLES, },
			sex: { type: "string", optional: true },
			organisation: { type: "string", optional: true },
			projects: { type: "array", items: "string", optional: true },
			settings: { type: "array", items: "object" }
		},
		actions: {
			sendMail: "v1.mail.send"
		},
	},

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
		 * Registers a new admin user.
		 *
		 * @actions
		 * @param {Object} user - User entity
		 *
		 * @returns {Object} Created entity & token
		 */
		first: {
			rest: "POST /user/first",
			params: {
				user: { type: "object" },
				org: { type: "object" },
			},
			async handler(ctx) {
				const user = ctx.params.user;

				if(user.email) {
					const isEmailExists = await this.adapter.findOne({ email: user.email });
					if(isEmailExists) throw new MoleculerClientError("User with that e-mail already exists!", 422);
				}
				const newOrg = await ctx.call("organisations.create", { organisation: ctx.params.org, throwIfNotExist: true });
				
				user.role = C.USER_ROLE_ADMIN;
				user.organisation = newOrg._id.toString();
				const newUser = await this.broker.call("user.create", { user: user });				

				const params = { organisation: { id: user.organisation, user: newUser.user._id.toString() }};
				await this.broker.call("organisations.addMember", params);

				newUser.user.organisation = await this.getUserOrganisation(ctx, user.organisation);
				return newUser;
			}
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

				const password = 'testing123'; //Math.random().toString(36).slice(2);
				user.firstName = user.firstName || "";
				user.lastName = user.lastName || "";
				user.password = bcrypt.hashSync(password, 10);
				user.role = user.role || C.USER_ROLE_EMPLOYEE;
				user.sex = user.sex || "male";
				user.organisation = user.organisation || "";
				user.projects = user.projects || [];
				user.settings = user.settings || [];

				const doc = await this.adapter.insert(user);
				const transDoc = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(transDoc, true, ctx.meta.token);
				await this.entityChanged("created", json, ctx);

				// Send verification
				const token = await this.generateToken(
					C.TOKEN_TYPE_VERIFICATION,
					json.user._id,
					TOKEN_EXPIRATION
				);

				const mailText = {
					title: "Welcome to Formo.com",
					text: `
						Hello <i>${user.firstName} ${user.lastName}</i>,<br>
						someone registered account on Formo.com using this e-mail.<br><br>
						Please click on the link down below and use this password to login: <b>${password}</b><br><br>
						${ctx.meta.url}verify-account?token=${token}
					`
				};

				//this.sendMail(ctx, json.user, mailText);
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
					fistName: { type: "string", min: 2, optional: true },
					lastName: { type: "string", min: 2, optional: true },
					password: { type: "string", min: 6, optional: true },
					role: { type: "string", optional: true },
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
				if(data.email) {
					const foundUser = await this.adapter.findOne({ email: data.email });
					if(foundUser && foundUser._id.toString() !== ctx.meta.user._id.toString()) 
						throw new MoleculerClientError("User with that e-mail already exists!", 422);
				}
				if(data.role && !C.USER_ROLES.includes(data.role)) {
					throw new MoleculerClientError("Invalid role ID", 400);
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
			auth: "required",
			params: {
				getOrg: { type: "boolean", optional: true }
			},
			async handler(ctx) {
				const user = await this.getById(ctx.params.id);
				if(!user) {
					throw new MoleculerClientError("User not found!", 404);
				}
				if(ctx.params.getOrg == undefined || ctx.params.getOrg) {
					user.organisation = await this.getUserOrganisation(ctx, user.organisation);
				}

				for(let i = 0, len = user.projects.length; i < len; i++) {
					const project = await ctx.call("projects.get", { id: user.projects[i] });
					user.projects[i] = _.pickBy(project, (v, k) => {
						return k == "name" || k == "budget" || k == "tasks";
					});
				}
				return user;
			}
		},

		/**
		 * Returns User entity with small amount of data.
		 */
		getBasicData: {
			rest: "GET /user/small/:id",
			auth: "required",
			async handler(ctx) {
				const user = await this.getById(ctx.params.id);
				if(!user) throw new MoleculerClientError("User not found!", 404);
				return _.pickBy(user, (v, k) => {
					return k == "_id" || k == "firstName" || k == "lastName" || k == "role";
				});
			}
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
				
				let i = users.length;
				while(i--) {
					users[i].organisation = await this.getUserOrganisation(ctx, users[i].organisation);
				}
				return users;
			},
		},

		/**
		 * Removes User entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /user/:id",
			auth: "required",
			async handler(ctx) {
				if(ctx.meta.user._id != ctx.params.id) throw new MoleculerClientError("Not allowed!", 405);
				const user = await this.getById(ctx.params.id);
				if(!user) throw new MoleculerClientError("User not found!", 404);

				this.broker.emit('user.removed', { user: user._id, org: user.organisation, oldNick: `${user.firstName} ${user.lastName}` });
				this.adapter.removeById(ctx.params.id);
				return 'User deleted!';
			}
		},

		/**
		 * Start "forgot password" process
		 */
		forgotPassword: {
			params: {
				email: { type: "email" }
			},
			rest: "POST /forgot-password",
			async handler(ctx) {
				const email = ctx.params.email;
				const user = await this.adapter.findOne({ email });
				if (!user) throw new MoleculerClientError("Email is not registered.", 404);

				const token = this.generateToken(
					C.TOKEN_TYPE_PASSWORD_RESET,
					user._id,
					TOKEN_EXPIRATION
				);

				await this.adapter.updateById(user._id, {
					$set: {
						resetToken: token,
						resetTokenExpires: Date.now() + 3600 * 1000 // 1 hour
					}
				});

				const mailText = {
					title: "Welcome to Formo.com",
					text: `
						Hello <i>${user.firstName} ${user.lastName}</i>,<br>
						someone requested password reset.<br><br>
						Please click on the <a href="${ctx.meta.url}reset-password?token=${token}">link</a> to reset your password.
					`
				};
				//this.sendMail(ctx, user, mailText);
				return true;
			}
		},

		/**
		 * Reset password
		 */
		resetPassword: {
			params: {
				token: { type: "string" },
				password: { type: "string", min: 8 }
			},
			rest: "POST /reset-password",
			async handler(ctx) {
				const user = await this.adapter.findOne({ resetToken: ctx.params.token });
				if (!user) throw new MoleculerClientError("Invalid token!", 400);
				if (user.resetTokenExpires < Date.now()) throw new MoleculerClientError("Token expired!", 400);

				// Change the password
				await this.adapter.updateById(user._id, {
					$set: {
						password: await bcrypt.hash(ctx.params.password, 10),
						passwordless: false,
						verified: true,
						resetToken: null,
						resetTokenExpires: null
					}
				});

				const doc = await this.transformDocuments(ctx, {}, user);
				return await this.transformEntity(doc, true, ctx.meta.token);
			}
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

		/**
		 * Used to check is provided user ID is valid.
		 */
		isCreated: {
			rest: "GET /user/check/:id",
			async handler(ctx) {
				return await this.adapter.findOne({ "_id": ctx.params.id });
			}
		},

		/**
		 * Checks if given user authorized to access certain action.
		 */
		isAuthorized: {
			rest: "GET /user/authorized/:id",
			auth: "required",
			params: {
				actionRank: { type: "string" }
			},
			async handler(ctx) {
				return await this.checkIsAuthorized(ctx.params.id, ctx.params.actionRank);
			}
		},
	},

	/**
	 * Events
	 */
	events: {
		"user.orgAdded": {
			async handler(payload) {				
				if(!payload) return;
				const user = await this.adapter.findOne({ "_id": payload.user });
				if(!user) return;

				user.organisation = payload.id;
				await this.adapter.updateById(payload.user, { "$set": user });
			}
		},

		"project.created": {
			async handler(payload) {
				if(!payload) return;
				const user = await this.adapter.findOne({ "_id": payload.user });
				if(!user) return;
				
				user.projects.push(payload.project);
				user.updatedAt = new Date();
				await this.adapter.updateById(payload.user, { "$set": user });
			}
		},

		"project.removed": {
			async handler(payload) {
				if(!payload) return;
				const users = await this.adapter.find({ query: { projects: payload.project } });
				if(!users) return;

				let idx = users.length;
				while(idx--) {
					users[idx].projects = users[idx].projects.filter(p => p != payload.project);
					users[idx].updatedAt = new Date();
					await this.adapter.updateById(users[idx]._id, { "$set": users[idx] });
				}
			}
		},

		"organisation.removed": {
			async handler(payload) {
				if(!payload) return;

				const users = await this.adapter.find({ query: { organisation: payload.org } });
				if (!users) return;

				let idx = users.length;
				while(idx--) {
					users[idx].role = "employee";
					users[idx].organisation = "";
					await this.adapter.updateById(users[idx]._id, { "$set": data });
				}
			}
		},
	},

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
		},

		/**
		 * Returns users organisation with clean data.
		 * @param {*} organisation 
		 * @returns 
		 */
		async getUserOrganisation(ctx, organisation) {
			const userOrg = await ctx.call("organisations.get", { id: organisation });
			return _.pickBy(userOrg, (v, k) => {
				return k == "name" || k == "address" || k == "city" || k == "country" || k == "_id";
			});
		},

		/**
		 * Checks if given user authorized to access certain action.
		 */
		async checkIsAuthorized(id, actionRoles) {
			const roles = actionRoles.split('|');
			const user = await this.adapter.findOne({ "_id": id });
			if(!user) return;

			let isAuthorized = false;
			let idx = roles.length;
			while(idx--) {
				if(roles[idx] == user.role) {
					isAuthorized = true;
					break;
				}
			}
			return isAuthorized;
		},

		/**
		 * Generate a token for user
		 *
		 * @param {String} type
		 * @param {String} owner
		 * @param {Number?} expiration
		 */
		async generateToken(type, owner, expiration) {
			const res = await this.broker.call("tokens.generate", {
				type: type,
				owner: owner,
				expiry: expiration ? Date.now() + expiration : null
			});

			return res.token;
		},

		/**
		 * Send email to the user email address
		 *
		 * @param {Context} ctx
		 * @param {Object} user
		 * @param {String} template
		 */
		async sendMail(ctx, user, template) {
			return await ctx.call(
				this.settings.actions.sendMail, {
					from: "no-reply@formo.com",
					to: user.email,
					subject: template.title,
					html: template.text
				},
				{ retries: 3, timeout: 10 * 1000 }
			);
		},
	}
};
