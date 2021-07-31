"use strict";

const _ = require('lodash');
const jwt = require("jsonwebtoken");
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
			"name",
			"organisation",
			"budget",
			"members",
			"tasks",
		],
		entityValidator: {
			name: { type: "string", min: 2 },
			organisation: { type: "string", min: 2 },
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
				const jwtToken = jwt.decode(ctx.meta.token);

				if(!ctx.params.project.organisation || ctx.params.project.organisation == "")
					throw new MoleculerClientError("Organisation ID is not provided!", 400);

				await this.validateEntity(entity);
				await this.waitForServices(["organisations"]);

				const isProjectExisting = await this.adapter.findOne({ name: entity.name });
				if(isProjectExisting) throw new MoleculerClientError("Project with that name already exists!", 422);

				const userOrg = await ctx.call("organisations.isCreated", { id: entity.organisation });
				if(!userOrg) throw new MoleculerClientError("Provided organisation not found!", 404);

				entity.name = entity.name || "";
				entity.organisation = entity.organisation || "";
				entity.budget = entity.budget || 0;
				entity.members = entity.members || [ jwtToken.id ];
				entity.tasks = entity.tasks || [];
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
				this.broker.emit('project.created', { org: entity.organisation, project: doc._id });
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

				const proj = await this.adapter.findOne({ _id: ctx.params.id });
				if (!proj) throw new MoleculerClientError("Project not found!", 404);

				const doc = await this.adapter.updateById(ctx.params.id, { $set: newData });
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
			async handler(ctx) {
				const project = await this.getById(ctx.params.id);
				if(!project) throw new MoleculerClientError("Project not found!", 404);
				
				for(let i = 0, len = project.members.length; i < len; i++) {
					const user = await ctx.call("user.get", { id: project.members[i], getOrg: false });
					project.members[i] = _.pickBy(user, (v, k) => {
						return k == "firstName" || k == "lastName" || k == "email" || k == "role";
					});
				}
				return project;
			}
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
			async handler(ctx) {
				const project = await this.getById(ctx.params.id);
				this.broker.emit('project.removed', { project: project._id, org: project.organisation });
				this.adapter.removeById(ctx.params.id);
				return 'Project deleted!';
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
