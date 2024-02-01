const { Connection, Request, TYPES } = require('tedious');

const {
	SQL_USER: userName,
	SQL_PASSWORD: password,
	SQL_SERVER: server,
} = process.env;

const config = {
	server,
	authentication: {
		type: 'default',
		options: {
			userName,
			password,
		},
	},
	options: {
		trustServerCertificate: true,
		readOnlyIntent: true,
		rowCollectionOnRequestCompletion: true,
	},
};

const request = (query, paramArray = []) => new Promise((resolve, reject) => {
	const sqlConnection = new Connection(config);

	const req = new Request(query, (err, rowCount, rows) => {
		if (err) {
			sqlConnection.close();
			reject(err);
		}
		resolve(rows);
	});

	paramArray.forEach((params) => {
		const { param, type, value } = params;
		if (!params.outParameter) req.addParameter(param, TYPES[type], value);
		else (req.addOutputParameter(param, TYPES[type]));
	});

	req.on('requestCompleted', () => sqlConnection.close());

	sqlConnection.on('end', () => console.log('---------------sql closed------------------'));

	sqlConnection.on('connect', (err) => {
		console.log('---------------sql connected---------------');
		if (err) reject(err);
		if (paramArray.length > 0) sqlConnection.callProcedure(req);
		else (sqlConnection.execSql(req));
	});

	sqlConnection.connect();
});

module.exports = request;
