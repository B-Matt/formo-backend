"use strict";

const { MoleculerClientError } = require("moleculer").Errors;
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "tasks",
	mixins: [DbService("tasks"), CacheCleanerMixin(["cache.clean.tasks"])],

	/**
	 * Settings
	 */
	settings: {
		rest: "/",
		fields: [
			"_id",
			"name",
			"description",
			"assignee",
			"dueDate",
			"project",
			"priority",
			"createdAt", 
			"updatedAt"
		],
		entityValidator: {
			name: { type: "string", min: 2 },
			description: { type: "number" },
			assignee: { type: "object" },
			dueDate: { type: "date", optional: true },
			project: { type: "number" },
			priority: { type: "object", optional: true },
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
		 * Creates a new task.
		 * Auth is required!
		 *
		 * @actions
		 * @param {Object} task - Task entity
		 *
		 * @returns {Object} Created task
		 */
		create: {
			rest: "POST /tasks",
			auth: "required",
			params: {
				task: {
					type: "object",
					props: {
						name: { type: "string", min: 2 },
						description: { type: "number" },
						assignee: { type: "object" },
						dueDate: { type: "date", optional: true },
						project: { type: "number" },
						priority: { type: "object", optional: true },
					},
				},
			},
			async handler(ctx) {
				const entity = ctx.params.task;
				await this.validateEntity(entity);

				entity.name = entity.name || "";
				entity.assignee = entity.assignee || -1;
				entity.dueDate = entity.dueDate || null;
				entity.project = entity.project || null;
				entity.priority = entity.priority || null;
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
		 * @param {String} id - Task ID
		 * @param {Object} task - Task entity
		 *
		 * @returns {Object} Updated task
		 */
		update: {
			rest: "PATCH /tasks/:id",
			auth: "required",
			params: {
				id: { type: "string" },
				task: {
					type: "object",
					props: {
						name: { type: "string", min: 2 },
						description: { type: "number" },
						assignee: { type: "object" },
						dueDate: { type: "date", optional: true },
						project: { type: "number" },
						priority: { type: "object", optional: true },
					},
				},
			},
			async handler(ctx) {
				const newData = ctx.params.task;
				newData.updatedAt = new Date();

				const task = await this.adapter.findOne({ _id: ctx.params.id });
				if (!task) throw new MoleculerClientError("Task not found!", 404);

				const doc = await this.adapter.updateById(ctx.params.id, { $set: newData });
				const entity = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(entity);
				this.entityChanged("updated", json, ctx);
				return json;
			},
		},

		/**
		 * Returns Task entity from DB by provided ID.
		 */
		get: {
			rest: "GET /tasks/:id",
			auth: "required",
		},

		/**
		 * Returns list of Task entities inside DB.
		 */
		list: {
			rest: "GET /tasks",
		},

		/**
		 * Removes Task entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /tasks/:id",
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
