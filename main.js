require('dotenv').config();

const Client = require('ssh2-sftp-client');
const { MongoClient } = require('mongodb');

const {
	FTP_HOST: host,
	FTP_PASSWORD: password,
	FTP_USER: username,
	DB_URL: dbURL,
	NAME: indexName, 
} = process.env;

const { logger, sql } = require('./utils');

const sftp = new Client();
const dbClient = new MongoClient(`${dbURL}?appName=${indexName}`);

const docTypes = ['POD', 'RCF', 'INV', 'CI', 'LUM', 'SCALE'];
const fileHeaders = [
	'TMW Order #',
	'TMW Leg #',
	'Doc Type',
	'Carrier Invoice #',
	'Carrier Amount',
	'Carrier Invoice Date',
	'Approved Date',
];

const main = async () => {
	try {
		console.log('started');

		await sftp.connect({
			host,
			username,
			password,
			port: 22,
		});
		await dbClient.connect();

		const directoryList = await sftp.list('/transflo-flx-freightvana-prod-output/output');

		for (let i = 0; i < directoryList.length; i += 1) {
			try {
				const buffer = await sftp.get(`/transflo-flx-freightvana-prod-output/output/${directoryList[i].name}`);
				const rowArray = buffer.toString().split(',');
				const docExists = docTypes.some((type) => rowArray.includes(type));
				const isCI = rowArray.includes('CI');

				let boxChecked = false;
				let settlementSubmitted = false;
				let customError;

				if (docExists) {
					// call SP
					const paperworkParams = [
						{ param: 'ordnum', type: 'VarChar', value: rowArray[0], outParameter: false },
						{ param: 'doctype', type: 'VarChar', value: rowArray[2], outParameter: false },
						{ param: 'lastupdateby', type: 'VarChar', value: 'transflo', outParameter: false },
						{ param: 'legheader', type: 'VarChar', value: rowArray[1], outParameter: false },
					];
					console.log({ paperworkParams });
					try {
						await sql('FV2_image_SetPWReceivedY001_sp', paperworkParams);
						// need to check SQL repsonse and use that to toggle settlementSubmitted boolean
						boxChecked = true;
					} catch (err) {
						customError = new Error('Call to FV2_image_SetPWReceivedY001_sp failed');
						customError.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
						customError.code = 'SPFAIL';
						customError.config = paperworkParams;
					}
				}
				if (isCI && !error) {
					const settlementParams = [
						{ param: 'ordernumber', type: 'Int', value: parseInt(rowArray[0], 10), outParameter: false },
						{ param: 'user', type: 'VarChar', value: 'transflo', outParameter: false },
						{ param: 'carinvno', type: 'VarChar', value: rowArray[3], outParameter: false },
						{ param: 'carinvdate', type: 'DateTime', value: rowArray[5], outParameter: false },
					];
					console.log({ settlementParams });
					try {
						await sql('DevOps_Settlment_invno_date', settlementParams);
						// need to check SQL repsonse and use that to toggle settlementSubmitted boolean
						settlementSubmitted = true;
					} catch (err) {
						customError = new Error('Call to DevOps_Settlment_invno_date failed');
						customError.error = JSON.stringify(err, Object.getOwnPropertyNames(err));
						customError.code = 'SPFAIL';
						customError.config = settlementParams;
					}
				}

				// throwing this in a try/catch block because if this fails I still want to write
				// to Mongo in the code below
				try {
					await sftp.rcopy(
						`/transflo-flx-freightvana-prod-output/output/${directoryList[i].name}`,
						`/transflo-flx-freightvana-prod-output/processed/${directoryList[i].name}`
					);
					await sftp.delete(`/transflo-flx-freightvana-prod-output/output/${directoryList[i].name}`);
				} catch (error) {
					// need to add logger
					console.error(error);
					logger.error(error);
				}

				const logObj = {
					orderNumber: rowArray[0],
					legNumber: rowArray[1],
					docType: rowArray[2],
					carrierInvoiceNumber: rowArray[3],
					carrierAmount: rowArray[4],
					carrierInvoiceDate: rowArray[5],
					approvedDate: rowArray[6],
					updatedAt: new Date(),
					boxChecked,
					paperworkParams: boxChecked
					? 	[
							{ param: 'ordnum', type: 'VarChar', value: rowArray[0], outParameter: false },
							{ param: 'doctype', type: 'VarChar', value: rowArray[2], outParameter: false },
							{ param: 'lastupdateby', type: 'VarChar', value: 'transflo', outParameter: false },
							{ param: 'legheader', type: 'VarChar', value: rowArray[1], outParameter: false },
						]
					: [],
					settlementSubmitted,
					settlementParams: settlementSubmitted
					?	[
							{ param: 'ordernumber', type: 'Int', value: parseInt(rowArray[0], 10), outParameter: false },
							{ param: 'user', type: 'VarChar', value: 'transflo', outParameter: false },
							{ param: 'carinvno', type: 'VarChar', value: rowArray[3], outParameter: false },
							{ param: 'carinvdate', type: 'DateTime', value: rowArray[5], outParameter: false },
						]
					: [],
					file: directoryList[i],
					error: customError || null,
				};

				if (customError) logger.error(logObj);
				else logger.info(logObj);
			} catch (error) {
				console.error(error);
				logger.error(error);
			}
		};

		console.log('complete');
	} catch (error) {
		console.error(error);
	} finally {
		await sftp.end();
		dbClient.close();
	}
};

main();
