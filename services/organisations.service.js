"use strict";

const _ = require('lodash');
const { MoleculerClientError } = require("moleculer").Errors;
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "organisations",
	mixins: [
		DbService("organisations"),
		CacheCleanerMixin([
			"cache.clean.organisations"
		])
	],

	/**
	 * Settings
	 */
	settings: {
		rest: "/",
		fields: ["_id", "name", "address", "city", "country", "members", "projects", "createdAt", "updatedAt"],
		entityValidator: {
			name: { type: "string", min: 2 },
			address: { type: "string", min: 2 },
			city: { type: "string", min: 2 },
			country: { type: "string", min: 2 },
			members: { type: "array", items: "string", optional: true },
			projects: { type: "array", items: "string", optional: true },
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
		 * Creates a new organisation.
		 * Auth is required!
		 * 
		 * @actions
		 * @param {Object} organisation - Organisation entity
		 * 
		 * @returns {Object} Created organisation
		 */
		create: {
			rest: "POST /organisations",
			auth: "required",
			params: {
				organisation: { type: "object", props: {
					name: { type: "string", min: 2 },
					address: { type: "string", min: 2 },
					city: { type: "string", min: 2 },
					country: { type: "string", min: 2 },
					admins: { type: "array", items: "number", optional: true },
					employees: { type: "array", items: "number", optional: true },
					projects: { type: "array", items: "number", optional: true }
				} }
			},
			async handler(ctx) {
				const entity = ctx.params.organisation;
				await this.validateEntity(entity);

				if(entity.name) {
					const isNameExists = await this.adapter.findOne({ name: entity.name });
					if(isNameExists) throw new MoleculerClientError("Organisation with that name already exists!", 422);
				}

				entity.admins = entity.admins || [];
				entity.members = entity.members || [];
				entity.projects = entity.projects || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				let json = await this.transformDocuments(ctx, {}, doc);
				json = await this.transformEntity(entity);
				json['_id'] = doc._id;
				await this.entityChanged("created", json, ctx);
				return json;
			}
		},

		/**
		 * Updates a organisation by provided ID (_id from the DB).
		 * Auth is required!
		 * 
		 * @actions
		 * @param {String} id - Organisation ID
		 * @param {Object} organisation - Organisation entity
		 * 
		 * @returns {Object} Updated organisation
		 */
		update: {
			rest: "PATCH /organisations/:id",
			auth: "required",
			params: {
				id: { type: "string" },
				organisation: { type: "object", props: {
					name: { type: "string", min: 2 },
					address: { type: "string", min: 2 },
					city: { type: "string", min: 2 },
					country: { type: "string", min: 2 },
					members: { type: "array", items: "string", optional: true },
					projects: { type: "array", items: "string", optional: true }
				} }
			},
			async handler(ctx) {
				const newData = ctx.params.organisation;
				newData.updatedAt = new Date();

				const org = await this.adapter.findOne({ "_id": ctx.params.id });
				if(!org) throw new MoleculerClientError("Organisation not found!", 404);

				const doc = await this.adapter.updateById(ctx.params.id, { "$set": newData });
				const entity = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(entity);
				this.entityChanged("updated", json, ctx);
				return json;
			}
		},

		/**
		 * Returns Organisation entity from DB by provided ID.
		 */
		get: {
			rest: "GET /organisations/:id",
			auth: "required",
			async handler(ctx) {
				const org = await this.adapter.findOne({ "_id": ctx.params.id });
				
				let membersIdx = org.members.length;
				while(membersIdx--) {
					const user = await ctx.call("user.get", { id: org.members[membersIdx], getOrg: false });
					org.members[membersIdx] = _.pickBy(user, (v, k) => {
						return k == "firstName" || k == "lastName" || k == "role";
					});
				}
				return org;
			}
		},

		/**
		 * Used to check is provided organisation ID is valid.
		 */
		isCreated: {
			rest: "GET /organisations/check/:id",
			async handler(ctx) {
				return await this.adapter.findOne({ "_id": ctx.params.id });
			}
		},

		/**
		 * Returns list of Organisation entities inside DB.
		 */
		list: {
			rest: "GET /organisations"
		},

		/**
		 * Removes Organisation entity from DB based on provided entity ID.
		 */
		remove: {
			auth: "required",
			rest: "DELETE /organisations/:id"
		},

		/**
		 * Adds new member to the organisation's members field.
		 */
		addMember: {
			auth: "required",
			rest: "POST /organisations/member",
			params: {
				organisation: { type: "object", props: {
					id: { type: "string", min: 2 },
					user: { type: "string", min: 2 },
				} }
			},
			async handler(ctx) {
				const org = await this.adapter.findOne({ "_id": ctx.params.organisation.id });
				if(!org) throw new MoleculerClientError("Organisation not found!", 404);
				if(org.members.indexOf(ctx.params.organisation.user) != -1) throw new MoleculerClientError("User is already member of this organisation!", 409);

				org.members.push(ctx.params.organisation.user);
				org.updatedAt = new Date();

				this.broker.emit('user.orgAdded', ctx.params.organisation);
				return await this.adapter.updateById(ctx.params.organisation.id, { "$set": org });
			}
		},

		/**
		 * Removes member from the organisation.
		 */
		removeMember: {
			auth: "required",
			rest: "DELETE /organisations/member/",
			params: {
				organisation: { type: "object", props: {
					id: { type: "string", min: 2 },
					user: { type: "string", min: 2 },
				} }
			},
			async handler(ctx) {
				const org = await this.adapter.findOne({ "_id": ctx.params.organisation.id });
				if(!org) throw new MoleculerClientError("Organisation not found!", 404);
				if(org.members.indexOf(ctx.params.organisation.user) == -1) throw new MoleculerClientError("User is not member of this organisation!", 400);

				org.members = org.members.filter(m => m != ctx.params.organisation.user);
				org.updatedAt = new Date();
				return await this.adapter.updateById(ctx.params.organisation.id, { "$set": org });
			}
		},

		/**
		 * 
		 */
		projects: {
			auth: "required",
			rest: "GET /organisations/projects/:id",
			params: {
			},
			async handler(ctx) {
				await this.waitForServices(["projects"]);
				const org = await this.adapter.findOne({ "_id": ctx.params.id });
				if(!org) throw new MoleculerClientError("Organisation not found!", 404);

				for(let i = 0, len = org.projects.length; i < len; i++) {
					const project = await ctx.call("projects.get", { id: org.projects[i] });
					org.projects[i] = _.pickBy(project, (v, k) => {
						return k == "name" || k == "budget";
					});
				}
				return org.projects;
			}
		},
	},

	/**
	 * Events
	 */
	events: {
		"user.removed": {
			async handler(payload) {
				if(!payload) return;
				const org = await this.adapter.findOne({ "_id": payload.org });
				if(!org) return;

				org.members = org.members.filter(m => m != payload.user);
				org.updatedAt = new Date();
				await this.adapter.updateById(payload.org, { "$set": org });
			}
		},

		"project.created": {
			async handler(payload) {
				if(!payload) return;
				const org = await this.adapter.findOne({ "_id": payload.org });
				if(!org) return;
				
				org.projects.push(payload.project);
				org.updatedAt = new Date();
				await this.adapter.updateById(payload.org, { "$set": org });
			}
		},

		"project.removed": {
			async handler(payload) {
				if(!payload) return;
				const org = await this.adapter.findOne({ "_id": payload.org });
				if(!org) return;
				
				org.projects = org.projects.filter(p => p != payload.project);
				org.updatedAt = new Date();
				await this.adapter.updateById(payload.org, { "$set": org });
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
		/**
		 * Transform a result entity to follow the RealWorld API spec
		 *
		 * @param {Object} entity
		 */
		async transformEntity(entity) {
			return entity || null;
		}
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {
	},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {
	},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {
	}
};
