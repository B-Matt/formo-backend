"use strict";

const _ = require('lodash');
const { MoleculerClientError } = require("moleculer").Errors;
const DbService = require("../mixins/db.mixin");
const CacheCleanerMixin = require("../mixins/cache.cleaner.mixin");

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "task.comments",
	mixins: [
		DbService("task.comments"),
		CacheCleanerMixin(["cache.clean.task.comments"]),
	],

	/**
	 * Settings
	 */
    settings: {
		rest: "/",
		fields: [
			"_id",
			"author",
			"text",
            "task",
			"createdAt", 
			"updatedAt"
		],
		entityValidator: {
			author: { type: "string", min: 2 },
			text: { type: "string", min: 1, max: 255 },
			task: { type: "string" },
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
		 * Creates a new comment.
		 * Auth is required!
		 *
		 * @actions
		 * @param {Object} comment - Comment entity
		 *
		 * @returns {Object} Created comment
		 */
		create: {
			rest: "POST /tasks/comment",
			auth: "required",
			params: {
				comment: {
					type: "object",
					props: {
						author: { type: "string", min: 2 },
                        text: { type: "string", min: 1, max: 255 },
                        task: { type: "string" },
					},
				},
			},
			async handler(ctx) {
				const entity = ctx.params.comment;
				await this.validateEntity(entity);

				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager|employee" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				if(entity.author) {
					const isUserExisting = await ctx.call("user.isCreated", { id: entity.author });
					if(!isUserExisting) throw new MoleculerClientError("Provided user not found!", 404);
				}

				const isTaskExisting = await ctx.call("tasks.isCreated", { id: entity.task });
				if(!isTaskExisting) throw new MoleculerClientError("Provided task not found!", 404);

				entity.author = entity.author || "";
				entity.text = entity.text || "";
				entity.task = entity.task || null;
				entity.createdAt = new Date();
				entity.updatedAt = new Date();

				const doc = await this.adapter.insert(entity);
                this.broker.emit('task.comment.created', { comment: doc._id, task: entity.task });

				let json = await this.transformDocuments(ctx, {}, doc);
				json = await this.transformEntity(entity);
				await this.entityChanged("created", json, ctx);
				return json;
			},
		},

		/**
		 * Updates a task comment by provided ID (_id from the DB).
		 * Auth is required!
		 *
		 * @actions
		 * @param {String} id - Comment ID
		 * @param {Object} comment - Comment entity
		 *
		 * @returns {Object} Updated comment
		 */
		update: {
			rest: "PATCH /tasks/comment/:id",
			auth: "required",
			params: {
				comment: { 
                    type: "object", 
                    props: {
                        author: { type: "string", min: 2 },
                        text: { type: "string", min: 1, max: 255 },
                        task: { type: "string" },
					},
				},
			},
			async handler(ctx) {
				const newData = ctx.params.comment;				
				const comment = await this.adapter.findOne({ _id: ctx.params.id });
				if (!comment) throw new MoleculerClientError("Task comment not found!", 404);

				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);
				
				newData.updatedAt = new Date();
				const doc = await this.adapter.updateById(ctx.params.id, { $set: newData });
				const entity = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(entity);
				this.entityChanged("updated", json, ctx);
				return json;
			},
		},

		/**
		 * Returns task comment entity from DB by provided ID.
		 */
		get: {
			rest: "GET /tasks/comment/:id",
			auth: "required",
			async handler(ctx) {
				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager|employee" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				const comment = await this.getById(ctx.params.id);
				if(!comment) throw new MoleculerClientError("Task comment not found!", 404);
				const author = await ctx.call("user.getBasicData", { id: comment.author, throwIfNotExist: false });
				if(author) comment.author = author;
				return comment;
			}
		},

        /**
		 * Removes task comment entity from DB based on provided entity ID.
		 */
		remove: {
			rest: "DELETE /tasks/comment/:id",
			auth: "required",
			async handler(ctx) {
				const isAuthorized = await ctx.call("user.isAuthorized", { id: ctx.meta.user._id, actionRank: "admin|project_manager|employee" });
				if(!isAuthorized) throw new MoleculerClientError("User with that role can't use this action.", 405);

				const comment = await this.getById(ctx.params.id);
				if(!comment) throw new MoleculerClientError("Task comment not found!", 404);

                this.broker.emit('task.comment.removed', { comment: comment._id, task: comment.task });
				this.adapter.removeById(ctx.params.id);
				return 'Task comment deleted!';
			}
		},
	},

	/**
	 * Events
	 */
	events: {
        "task.removed": {
			async handler(payload) {
				if(!payload) return;
				const comments = await this.adapter.find({ task: payload.task });
				if(!comments) return;

				let idx = comments.length;
				while(idx--) {
					this.adapter.removeById(comments[idx]._id);
				}
			}
		},

		"user.removed": {
			async handler(payload) {
				if(!payload) return;
				const comments = await this.adapter.find({ query: { author: payload.user } });
				if (!comments) return;

				let idx = comments.length;
				while(idx--) {
					comments[idx].author = payload.oldNick;
					this.adapter.updateById(comments[idx]._id, { "$set": comments[idx] });
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
				user.token = token;
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
