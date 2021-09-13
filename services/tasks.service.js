"use strict";

const _ = require('lodash');
const C = require("../constants");
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
			"status",
			"name",
			"description",
			"assignee",
			"dueDate",
			"project",
			"priority",
			"comments",
			"attachments",
			"createdAt", 
			"updatedAt"
		],
		entityValidator: {
			status: { type: "enum", values: C.TASK_STATUSES, optional: true },
			name: { type: "string", min: 2 },
			description: { type: "string" },
			assignee: { type: "string", optional: true },
			dueDate: { type: "date", optional: true },
			project: { type: "string" },
			priority: { type: "object", optional: true },
			comments: { type: "array", optional: true },
			attachments: { type: "array", optional: true }
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
						status: { type: "enum", values: C.TASK_STATUSES, optional: true },
						name: { type: "string", min: 2 },
						description: { type: "string" },
						assignee: { type: "string", optional: true },
						dueDate: { type: "date", optional: true },
						project: { type: "string" },
						priority: { type: "object", optional: true },
						comments: { type: "array", optional: true }
					},
				},
			},
			async handler(ctx) {
				const entity = ctx.params.task;
				await this.validateEntity(entity);

				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				if(entity.assignee) {
					const isUserExisting = await ctx.call("user.isCreated", { id: entity.assignee });
					if(!isUserExisting) throw new MoleculerClientError("Provided user not found!", 404);
				}

				const isProjectExisting = await ctx.call("projects.isCreated", { id: entity.project });
				if(!isProjectExisting) throw new MoleculerClientError("Provided project not found!", 404);

				entity.status = C.TASK_STATUS_BACKLOG;
				entity.name = entity.name || "";
				entity.assignee = entity.assignee || "";
				entity.dueDate = entity.dueDate || null;
				entity.project = entity.project || null;
				entity.priority = entity.priority || null;
				entity.comments = entity.comments || [];
				entity.attachments = entity.attachments || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				this.broker.emit('task.created', { project: entity.project, task: doc._id, user: entity.assignee });

				const project = await ctx.call("projects.get", { id: doc.project, throwIfNotExist: false });
				doc.project =  _.pickBy(project, (v, k) => {
					return k == "name" || k == "organisation" || k == "budget";
				});
				return await this.getTaskData(doc, ctx);
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

				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if (!task) throw new MoleculerClientError("Task not found!", 404);

				const doc = await this.adapter.updateById(ctx.params.id, { $set: newData });
				const project = await ctx.call("projects.get", { id: doc.project, throwIfNotExist: false });
				doc.project =  _.pickBy(project, (v, k) => {
					return k == "name" || k == "organisation" || k == "budget";
				});
				return await this.getTaskData(doc, ctx);
			},
		},

		/**
		 * Returns Task entity from DB by provided ID.
		 */
		get: {
			rest: "GET /task/:id",
			auth: "required",
			async handler(ctx) {
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!task) throw new MoleculerClientError("Task not found!", 404);
				return await this.getTaskData(task, ctx);
			}
		},

		/**
		 * Returns list of Task entities inside DB.
		 */
		list: {
			rest: "GET /tasks/:project",
			auth: "required",
			async handler(ctx) {
				const tasks = await this.adapter.find({ query: { project: ctx.params.project } });
				let idx = tasks.length;
				while(idx--) {
					tasks[idx] = await this.getTaskData(tasks[idx], ctx);
				}
				return tasks;
			}
		},

		/**
		 * Removes Task entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /tasks/:id",
			auth: "required",
			async handler(ctx) {
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!task) throw new MoleculerClientError("Task not found!", 404);

				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

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
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!task) throw new MoleculerClientError("Task not found!", 404);

				task.assignee = ctx.params.user;
				task.updatedAt = new Date();

				const doc = await this.adapter.updateById(task._id, { "$set": task });
				const project = await ctx.call("projects.get", { id: doc.project, throwIfNotExist: false });

				doc.project =  _.pickBy(project, (v, k) => {
					return k == "name" || k == "organisation" || k == "budget";
				});
				return await this.getTaskData(doc, ctx);
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
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!task) throw new MoleculerClientError("Task not found!", 404);
				if(task.assignee != ctx.params.user) throw new MoleculerClientError("Task with provided user not found!", 404);

				task.assignee = "";
				task.updatedAt = new Date();

				const doc = await this.adapter.updateById(task._id, { "$set": task });
				const project = await ctx.call("projects.get", { id: doc.project, throwIfNotExist: false });

				doc.project =  _.pickBy(project, (v, k) => {
					return k == "name" || k == "organisation" || k == "budget";
				});
				return await this.getTaskData(doc, ctx);
			}
		},

		/**
		 * Used to check is provided task ID is valid.
		 */
		isCreated: {
			rest: "GET /tasks/check/:id",
			async handler(ctx) {
				return await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
			}
		},
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
					this.broker.emit('task.removed', { task: tasks[idx]._id, project: payload.project });
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

		"task.comment.created": {
			async handler(payload) {
				if(!payload) return;
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.task) });
				if (!task) return;

				task.comments.push(payload.comment);
				task.updatedAt = new Date();
				await this.adapter.updateById(payload.task, { "$set": task });
			}
		},

		"task.comment.removed": {
			async handler(payload) {
				if(!payload) return;
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.task) });
				if (!task) return;

				task.comments = task.comments.filter(c => c != payload.comment);
				task.updatedAt = new Date();
				await this.adapter.updateById(payload.task, { "$set": task });
			}
		},

		"task.attachment.uploaded": {
			async handler(payload) {
				if(!payload) return;
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.task) });
				if (!task) return;

				task.attachments.push(payload.file);
				task.updatedAt = new Date();
				await this.adapter.updateById(payload.task, { "$set": task });
			}
		},

		"task.attachment.removed": {
			async handler(payload) {
				if(!payload) return;
				const task = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.task) });
				console.log(payload, task);
				if (!task) return;

				task.attachments = task.attachments.filter(c => c != payload.file);
				task.updatedAt = new Date();
				await this.adapter.updateById(payload.task, { "$set": task });
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

		/**
		 * Populates tasks fields that need population.
		 * @param {*} task 
		 * @param {*} ctx 
		 * @returns 
		 */
		async getTaskData(task, ctx) {
			/*for(let i = 0, len = task.comments.length; i < len; i++) {
				const comment = await ctx.call("task.comments.get", { id: task.comments[i], throwIfNotExist: false });
				task.comments[i] =  _.pickBy(comment, (v, k) => {
					return k == "author" || k == "text" || k == "updatedAt";
				});
			}*/

			for(let i = 0, len = task.attachments.length; i < len; i++) {
				task.attachments[i] = `${ctx.meta.url}upload/${task._id}/${task.attachments[i]}`;
			}

			if(!task.assignee) return task;
			task.assignee = await ctx.call("user.getBasicData", { id: task.assignee, throwIfNotExist: false });
			return task;
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
