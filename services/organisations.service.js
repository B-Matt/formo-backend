"use strict";

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
		fields: ["_id", "name", "admins", "employees", "projects", "createdAt", "updatedAt"],
		entityValidator: {
			name: { type: "string", min: 2 },
			admins: { type: "array", items: "number", optional: true },
			employees: { type: "array", items: "number", optional: true },
			projects: { type: "array", items: "number", optional: true },
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
				entity.employees = entity.employees || [];
				entity.projects = entity.projects || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				let json = await this.transformDocuments(ctx, {}, doc);
				json = await this.transformEntity(entity);
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
					admins: { type: "array", items: "number", optional: true },
					employees: { type: "array", items: "number", optional: true },
					projects: { type: "array", items: "number", optional: true }
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
			auth: "required"
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
			rest: "DELETE /organisations/:id",
			auth: "required"
		},
	},

	/**
	 * Events
	 */
	events: {
		// TODO: Create event that is called when user deletes it's account (so that user can be removed from organisation arrays).
		// TODO: Create event that is called when new user joins organisation.
		// TODO: Create event that is called when new project is created.
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
