"use strict";

const { MoleculerClientError } = require("moleculer").Errors;
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "projects",
	mixins: [
		DbService("projects"),
		CacheCleanerMixin(["cache.clean.projects"]),
	],

	/**
	 * Settings
	 */
	settings: {
		// TODO: Pogledati populates i to staviti pod organisation i tasks
		rest: "/",
		fields: [
			"_id",
			"name",
			"organisation",
			"privacy",
			"budget",
			"members",
			"tasks",
		],
		entityValidator: {
			name: { type: "string", min: 2 },
			organisation: { type: "number" },
			privacy: { type: "object" },
			budget: { type: "number", optional: true },
			members: { type: "array", items: "number", optional: true },
			tasks: { type: "array", items: "number", optional: true },
		},
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
		 * Creates a new project.
		 * Auth is required!
		 *
		 * @actions
		 * @param {Object} organisation - Project entity
		 *
		 * @returns {Object} Created project
		 */
		create: {
			rest: "POST /projects",
			auth: "required",
			params: {
				project: {
					type: "object",
					props: {
						name: { type: "string", min: 1 },
						organisation: { type: "number" },
						privacy: { type: "object" },
						budget: { type: "number" },
						members: {
							type: "array",
							items: "number",
							optional: true,
						},
						tasks: {
							type: "array",
							items: "number",
							optional: true,
						},
					},
				},
			},
			async handler(ctx) {
				const entity = ctx.params.project;
				await this.validateEntity(entity);

				entity.name = entity.name || "";
				entity.organisation = entity.organisation || -1;
				entity.privacy = entity.privacy || null;
				entity.budget = entity.budget || 0;
				entity.members = entity.budget || [];
				entity.members = entity.budget || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				let json = await this.transformDocuments(ctx, {}, doc);
				json = await this.transformEntity(entity);
				await this.entityChanged("created", json, ctx);
				return json;
			},
		},

		/**
		 * Updates a project by provided ID (_id from the DB).
		 * Auth is required!
		 *
		 * @actions
		 * @param {String} id - Project ID
		 * @param {Object} organisation - Project entity
		 *
		 * @returns {Object} Updated project
		 */
		update: {
			rest: "PATCH /projects/:id",
			auth: "required",
			params: {
				id: { type: "string" },
				project: {
					type: "object",
					props: {
						name: { type: "string", min: 1 },
						organisation: { type: "number" },
						privacy: { type: "object" },
						budget: { type: "number" },
						members: {
							type: "array",
							items: "number",
							optional: true,
						},
						tasks: {
							type: "array",
							items: "number",
							optional: true,
						},
					},
				},
			},
			async handler(ctx) {
				const newData = ctx.params.project;
				newData.updatedAt = new Date();

				const org = await this.adapter.findOne({ _id: ctx.params.id });
				if (!org)
					throw new MoleculerClientError(
						"Project not found!",
						404
					);

				const doc = await this.adapter.updateById(ctx.params.id, {
					$set: newData,
				});
				const entity = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(entity);
				this.entityChanged("updated", json, ctx);
				return json;
			},
		},

		/**
		 * Returns Project entity from DB by provided ID.
		 */
		get: {
			rest: "GET /projects/:id",
			auth: "required",
		},

		/**
		 * Returns list of Project entities inside DB.
		 */
		list: {
			rest: "GET /projects",
		},

		/**
		 * Removes Project entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /projects/:id",
			auth: "required",
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
		 * Transform a result entity to follow the RealWorld API spec
		 *
		 * @param {Object} entity
		 */
		async transformEntity(entity) {
			return entity || null;
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {},
};
