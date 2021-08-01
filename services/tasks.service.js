"use strict";

const _ = require('lodash');
const { MoleculerClientError } = require("moleculer").Errors;
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "tasks",
	mixins: [
		DbService("tasks"), 
		CacheCleanerMixin(["cache.clean.tasks"])
	],

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
			description: { type: "string" },
			assignee: { type: "string", optional: true },
			dueDate: { type: "date", optional: true },
			project: { type: "string" },
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
						description: { type: "string" },
						assignee: { type: "string", optional: true },
						dueDate: { type: "date", optional: true },
						project: { type: "string" },
						priority: { type: "object", optional: true },
					},
				},
			},
			async handler(ctx) {
				const entity = ctx.params.task;
				await this.validateEntity(entity);

				if(entity.assignee) {
					const isUserExisting = await ctx.call("users.isCreated", { id: entity.assignee });
					if(!isUserExisting) throw new MoleculerClientError("Provided user not found!", 404);
				}

				const isProjectExisting = await ctx.call("projects.isCreated", { id: entity.project });
				if(!isProjectExisting) throw new MoleculerClientError("Provided project not found!", 404);

				entity.name = entity.name || "";
				entity.assignee = entity.assignee || "";
				entity.dueDate = entity.dueDate || null;
				entity.project = entity.project || null;
				entity.priority = entity.priority || null;
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				this.broker.emit('task.created', { project: entity.project, task: doc._id, user: entity.assignee });
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
				task: { type: "object", props: {
						name: { type: "string", min: 2 },
						description: { type: "string" },
						assignee: { type: "string" },
						dueDate: { type: "date", optional: true },
						project: { type: "string" },
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
			async handler(ctx) {
				const task = await this.getById(ctx.params.id);
				if(!task) throw new MoleculerClientError("Task not found!", 404);
				if(!task.assignee) return task;
				task.assignee = await ctx.call("user.getBasicData", { id: task.assignee, throwIfNotExist: false });
				return task;
			}
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
			async handler(ctx) {
				const task = await this.getById(ctx.params.id);
				if(!task) throw new MoleculerClientError("Task not found!", 404);

				this.broker.emit('task.removed', { task: task._id, project: task.project });
				this.adapter.removeById(ctx.params.id);
				return 'Task deleted!';
			}
		},

		/**
		 * Assignes selected user to the selected task.
		 */
		addMember: {
			rest: "POST /tasks/member/",
			auth: "required",
			params: {
				id: { type: "string", optional: true },
				user: { type: "string", optional: true },
			},
			async handler(ctx) {
				const task = await this.getById(ctx.params.id);
				if(!task) throw new MoleculerClientError("Task not found!", 404);

				task.assignee = ctx.params.user;
				task.updatedAt = new Date();

				const doc = await this.adapter.updateById(task._id, { "$set": task });
				const transDoc = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(transDoc, true, ctx.meta.token);
				await this.entityChanged("updated", json, ctx);
				return json;
			}
		},

		/**
		 * Removes selected user to the selected task.
		 */
		removeMember: {
			rest: "DELETE /tasks/member/",
			auth: "required",
			params: {
				id: { type: "string", optional: true },
				user: { type: "string", optional: true },
			},
			async handler(ctx) {
				const task = await this.getById(ctx.params.id);
				if(!task) throw new MoleculerClientError("Task not found!", 404);
				if(task.assignee != ctx.params.user) throw new MoleculerClientError("Task with provided user not found!", 404);

				task.assignee = "";
				task.updatedAt = new Date();

				const doc = await this.adapter.updateById(task._id, { "$set": task });
				const transDoc = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(transDoc, true, ctx.meta.token);
				await this.entityChanged("updated", json, ctx);
				return json;
			}
		}
	},

	/**
	 * Events
	 */
	events: {
		"project.removed": {
			async handler(payload) {
				if(!payload) return;
				const tasks = await this.adapter.find({ project: payload.project });
				if(!tasks) return;

				let idx = tasks.length;
				while(idx--) {
					this.adapter.removeById(tasks[idx]._id);
				}
			}
		},

		"user.removed": {
			async handler(payload) {
				if(!payload) return;
				const tasks = await this.adapter.find({ query: { assignee: payload.user } });
				if (!tasks) return;

				let idx = tasks.length;
				while(idx--) {
					tasks[idx].assignee = "";
					this.adapter.updateById(tasks[idx]._id, { "$set": tasks[idx] });
				}
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
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
