def getEnvName(branchName) {
	if ("dev".equals(branchName)) "dev";
	else if("staging".equals(branchName)) "staging";
	else if ("master".equals(branchName)) "production";
	else "anyOtherBranch";
}

def getName(branchName) {
	if("dev".equals(branchName)) "dev_fv_tmw_checkboxes_process";
	else if("staging".equals(branchName)) "staging_fv_tmw_checkboxes_process";
	else if ("master".equals(branchName)) "fv_tmw_checkboxes_process";
}

pipeline {
	agent {
		label 'rogue'
	}
	options {
		timeout(time: 1, unit: 'HOURS')
		buildDiscarder(logRotator(daysToKeepStr: '0', numToKeepStr: '0'))
	}
	environment {
		NODE_ENV = getEnvName(env.BRANCH_NAME)
		NAME = getName(env.BRANCH_NAME)
		HOME = '.'
		DB_URL=credentials('PROD_DB_SRV')
		FTP_HOST = credentials('TRANSFLO_FTP_HOST')
        FTP_CREDS = credentials('TRANSFLO_CREDS')
        SQL_USER = credentials('TMW_SQL_USER')
		SQL_PASSWORD = credentials('TMW_SQL_PW')
		SQL_SERVER = credentials('TMW_SQL_HOST')
	}
	stages {
		stage('Build and Test') {
			when {
				expression {
					return NODE_ENV == 'production';
				}
			}
			agent {
				dockerfile {
					filename 'Dockerfile'
					additionalBuildArgs '-t ${NAME}'
					label 'rogue'
				}
			}
			steps {
				sh 'npm install'
			}
		}
		stage('Prep') {
			when {
				expression {
					return NODE_ENV == 'production';
				}
			}
			steps {
				script {
					try {
						sh 'docker stop ${NAME}'
						sh 'docker rm ${NAME}'
					} catch(Exception e) {
						echo 'Exception occurred: ' + e.toString()
					}
				}
			}
		}
		stage('Deploy Production') {
			when {
				expression {
					return NODE_ENV == 'production';
				}
			}
			steps {
				sh '''
					docker run \
						-d \
						--restart unless-stopped \
						--name ${NAME} \
						-e NODE_ENV=${NODE_ENV} \
						-e NAME=${NAME} \
						-e DB_URL=${DB_URL}?appName=fv_tmw_checkboxes_process \
						-e FTP_HOST=${FTP_HOST} \
						-e FTP_USER=${FTP_CREDS_USR} \
						-e FTP_PASSWORD=${FTP_CREDS_PSW} \
                        -e SQL_USER=${SQL_USER} \
						-e SQL_PASSWORD=${SQL_PASSWORD} \
						-e SQL_SERVER=${SQL_SERVER} \
						${NAME}
				'''
			}
		}
		stage('Cleanup') {
			steps {
				sh 'docker image prune -af'
				sh 'docker buildx prune -f'
				sh 'docker network prune -f'
			}
		}
	}
}