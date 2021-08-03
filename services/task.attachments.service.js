"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { MoleculerClientError } = require("moleculer").Errors;
const mkdir = require("mkdirp").sync;
const mime = require("mime-types");

// Upload Directory
const UPLOAD_DIR = path.join("./public", "attachments", "tasks");
mkdir(UPLOAD_DIR);

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */
module.exports = {
	name: "task.attachments",

	/**
	 * Actions
	 */
	actions: {
		get: {
			async handler(ctx) {
				const filePath = path.join(UPLOAD_DIR, ctx.params.task, ctx.params.file);
				if (!fs.existsSync(filePath)) throw new MoleculerClientError("Attachment path not found!", 404);

				ctx.meta.$responseType = mime.lookup(ctx.params.file);
				return fs.createReadStream(filePath);
			}
		},

		save: {
			async handler(ctx) {
				const isTaskExisting = await ctx.call("tasks.isCreated", { id: ctx.meta.fieldname });
				if(!isTaskExisting) throw new MoleculerClientError("Provided task not found!", 404);

				return new this.Promise((resolve, reject) => {
					const taskDir = path.join(UPLOAD_DIR, ctx.meta.fieldname);
					const fileName = this.randomName(ctx.meta.filename);
					const filePath = path.join(taskDir, fileName);
					const file = fs.createWriteStream(filePath);

					if(!fs.existsSync(taskDir)) {
						mkdir(taskDir);
					}
					
					file.on("close", () => {
						resolve({ filePath, meta: ctx.meta });
					});

					ctx.params.on("error", err => {
						reject(err);
						file.destroy(err);
					});

					file.on("error", (err) => {
						reject(err);
						fs.unlinkSync(filePath);
					});

					ctx.params.pipe(file);
					this.broker.emit('task.attachment.uploaded', { task: ctx.meta.fieldname, file: fileName });
				});
			}
		},

		remove: {
			async handler(ctx) {
				const filePath = path.join(UPLOAD_DIR, ctx.params.task, ctx.params.file);
				if (!fs.existsSync(filePath)) throw new MoleculerClientError("Attachment not found!", 404);

				this.broker.emit('task.attachment.removed', { task: ctx.params.task, file: ctx.params.file });
				fs.unlinkSync(filePath);

				const dirPath = path.join(UPLOAD_DIR, ctx.params.task);
				fs.readdir(dirPath, (err, files) => {
					if(files.length < 1) {
						fs.rm(dirPath, { recursive: true, force: true }, (err) => console.log(err));
					}
				});				
				return "Attachment removed!";
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
				const filePath = path.join(UPLOAD_DIR, payload.task);
				if (!fs.existsSync(filePath)) return;

				fs.readdir(filePath, (err, files) => {
					files.forEach(file => {
						fs.unlink(`${filePath}/${file}`);
					});
				});
				fs.rm(filePath, { recursive: true, force: true }, (err) => console.log(err));
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
		randomName(fileName) {
			const extension = mime.extension(mime.lookup(fileName));
			return crypto.randomBytes(20).toString('hex') + `.${extension}`;
		},
	},
};
