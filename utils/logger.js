const pino = require('pino');

const {
	NODE_ENV: nodeEnv,
	DB_URL: dbURL,
	INDEX_NAME: indexName,
} = process.env;

const pinoConfig = {
	level: nodeEnv === 'production' ? 'info' : 'debug',
	name: indexName,
	formatters: {
		level(label) {
			return { level: label };
		},
	},
};

if (nodeEnv === 'production') {
	pinoConfig.transport = {
		target: 'pino-mongodb',
		options: {
			uri: dbURL,
			database: 'Transflo',
			collection: 'processed_paperwork',
		},
	};
}

const logger = pino(pinoConfig);

module.exports = logger;
