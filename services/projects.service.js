"use strict";

const _ = require('lodash');
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
		rest: "/",
		fields: [
			"_id",
			"color",
			"name",
			"organisation",
			"budget",
			"members",
			"tasks",
		],
		entityValidator: {
			name: { type: "string", min: 2 },
			color: { type: "string", min: 2 },
			organisation: { type: "string", min: 2 },
			budget: { type: "number", optional: true },
			members: { type: "array", items: "string", optional: true },
			tasks: { type: "array", items: "string", optional: true },
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
		 * @param {Object} project - Project entity
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
						color: { type: "string", min: 2 },
						organisation: { type: "string" },
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
				if(!ctx.params.project.organisation || ctx.params.project.organisation == "")
					throw new MoleculerClientError("Organisation ID is not provided!", 400);

				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				await this.validateEntity(entity);
				await this.waitForServices(["organisations"]);

				const isProjectExisting = await this.adapter.findOne({ name: entity.name });
				if(isProjectExisting) throw new MoleculerClientError("Project with that name already exists!", 422);

				const userOrg = await ctx.call("organisations.isCreated", { id: entity.organisation });
				if(!userOrg) throw new MoleculerClientError("Provided organisation not found!", 404);

				entity.name = entity.name || "";
				entity.color = entity.color || "";
				entity.organisation = entity.organisation || "";
				entity.budget = entity.budget || 0;
				entity.members = entity.members || [ ctx.meta.user._id ];
				entity.tasks = entity.tasks || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				return await this.getProjectData(doc, ctx);
			},
		},

		/**
		 * Updates a project by provided ID (_id from the DB).
		 * Auth is required!
		 *
		 * @actions
		 * @param {String} id - Project ID
		 * @param {Object} project - Project entity
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
						color: { type: "string", min: 1 },
						organisation: { type: "number" },
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

				const proj = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if (!proj) throw new MoleculerClientError("Project not found!", 404);

				const doc = await this.adapter.updateById(ctx.params.id, { $set: newData });
				return await this.getProjectData(doc, ctx);
			},
		},

		/**
		 * Returns Project entity from DB by provided ID.
		 */
		get: {
			rest: "GET /projects/:id",
			auth: "required",
			params: {
			},
			async handler(ctx) {
				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager|employee" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				const project = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!project) throw new MoleculerClientError("Project not found!", 404);				
				return await this.getProjectData(project, ctx);
			}
		},

		/**
		 * Returns list of Project entities inside DB.
		 */
		list: {
			rest: "GET /projects/:org",
			auth: "required",
			async handler(ctx) {
				const projects = await this.adapter.find({ query: { organisation: ctx.params.org } });
				let idx = projects.length;
				while(idx--) {
					projects[idx] = await this.getProjectData(projects[idx], ctx);
				}
				return projects;
			}
		},

		/**
		 * Removes Project entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /projects/:id",
			auth: "required",
			async handler(ctx) {
				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);
				
				const project = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
				if(!project) throw new MoleculerClientError("Project not found!", 404);
	
				this.broker.emit('project.removed', { project: project._id, org: project.organisation });
				this.adapter.removeById(ctx.params.id);
				return 'Project deleted!';
			}
		},

		/**
		 * Used to check is provided project ID is valid.
		 */
		isCreated: {
			rest: "GET /projects/check/:id",
			async handler(ctx) {
				return await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(ctx.params.id) });
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
				const project = await this.adapter.findOne({ "organisation": payload.org });
				if(!project) return;

				project.members = project.members.filter(m => m != payload.user);
				project.updatedAt = new Date();
				await this.adapter.updateById(project._id, { "$set": project });
			}
		},

		"task.created": {
			async handler(payload) {
				if(!payload) return;
				const project = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.project) });
				if(!project) return;

				project.tasks.push(payload.task);
				project.updatedAt = new Date();
				await this.adapter.updateById(payload.project, { "$set": project });
			}
		},

		"task.removed": {
			async handler(payload) {
				if(!payload) return;
				const project = await this.adapter.findOne({ '_id': this.adapter.stringToObjectID(payload.project) });
				if(!project) return;

				project.tasks = project.tasks.filter(t => t != payload.task);
				project.updatedAt = new Date();
				await this.adapter.updateById(payload.project, { "$set": project });
			}
		},

		"organisation.removed": {
			async handler(payload) {
				if(!payload) return;

				const projects = await this.adapter.find({ query: { organisation: payload.org } });
				if (!projects) return;

				let idx = projects.length;
				while(idx--) {
					this.broker.emit('project.removed', { project: projects[idx]._id, org: null });
					this.adapter.removeById(projects[idx]._id);

				}
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
		},

		/**
		 * Populates projects fields that need population.
		 * @param {*} project 
		 * @param {*} ctx 
		 * @returns 
		 */
		async getProjectData(project, ctx) {
			for(let i = 0, len = project.tasks.length; i < len; i++) {
				const task = await ctx.call("tasks.get", { id: project.tasks[i], throwIfNotExist: false });
				project.tasks[i] = _.pickBy(task, (v, k) => {
					return k == "name" || k == "description" || k == "assignee" || k == "dueDate" || k == "priority";						
				});
			}
			for(let i = 0, len = project.members.length; i < len; i++) {
				project.members[i] = await ctx.call("user.getBasicData", { id: project.members[i] });
			}
			return project;
		}
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
