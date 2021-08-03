"use strict";

const MailService = require("moleculer-mail");

const MAILDEV_TRANSPORT = {
	host: "localhost",
	port: 1025,
	ignoreTLS: true
};

const MAILTRAP_TRANSPORT = {
	host: "smtp.mailtrap.io",
    port: 2525,
    auth: {
		user: process.env.MAILTRAP_USER,
		pass: process.env.MAILTRAP_PASS
	}
};

module.exports = {
	name: "mail",
	version: 1,

	mixins: [MailService],

	/**
	 * Service settings
	 */
	settings: {
		from: "no-reply@formo.com",
		transport: MAILTRAP_TRANSPORT
	}
};