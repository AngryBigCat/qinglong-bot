import * as util from 'node:util';
import axios from "axios";
import {QingLongAPI} from "./urls.js";
import {UpdateEnvRequest, GetAllEnvResponse, LoginResult, Response} from "../model/qinglong.js";
import {
    BadRequestError,
    QingLongAPIError,
    QingLongEnvNotFoundError,
    QingLongInitializationError
} from "../error/error.js";

axios.defaults.validateStatus = (status) => {
    return status < 500;
}

let baseUrl = '';
let clientId = '';
let clientSecret = '';

let token = '';
let expiration = 0;

function initializeQingLongAPIClient() {
    baseUrl = process.env.QINGLONG_URL || '';
    clientId = process.env.QINGLONG_CLIENT_ID || '';
    clientSecret = process.env.QINGLONG_CLIENT_SECRET || '';

    if (!baseUrl || !clientId || !clientSecret) {
        throw new QingLongInitializationError();
    }
}

async function login() {
    const response = await axios.get(`${baseUrl}${util.format(QingLongAPI.LOGIN, clientId, clientSecret)}`);
    const loginResponse = response.data as Response;
    ensureSuccessfulResponse(loginResponse);

    const loginResult: LoginResult = loginResponse.data as LoginResult;
    token = loginResult.token;
    expiration = loginResult.expiration * 1000;

    console.info(`成功刷新青龙Token，有效期至${new Date(expiration).toLocaleString()}`);
}

async function loginIfNeeded() {
    const currentTimestamp = Date.now();
    if (currentTimestamp - 5000 >= expiration) {
        await login();
    }
}

async function getAllEnvironmentVariables(): Promise<GetAllEnvResponse[]> {
    await loginIfNeeded();

    const response = await axios.get(
        `${baseUrl}${QingLongAPI.ENV}`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const getAllEnvResponse = response.data as Response;
    ensureSuccessfulResponse(getAllEnvResponse);

    return getAllEnvResponse.data as GetAllEnvResponse[];
}

async function updateEnvironmentVariables(
    key: string,
    value: string
) {
    if (!key || !value) {
        throw new BadRequestError('更新环境变量消息格式有误，正确格式为：key=value');
    }

    await loginIfNeeded();

    const allEnvironmentVariables = await getAllEnvironmentVariables();
    const envToBeUpdated = allEnvironmentVariables.filter(env => env.name === key)[0];
    if (!envToBeUpdated) {
        throw new QingLongEnvNotFoundError(key);
    }

    const updateEnvRequest: UpdateEnvRequest = {
        id: envToBeUpdated.id,
        name: envToBeUpdated.name,
        value: value
    };

    const response = await axios.put(
        `${baseUrl}${QingLongAPI.ENV}`,
        updateEnvRequest,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    const updateEnvResponse = response.data as Response;
    ensureSuccessfulResponse(updateEnvResponse);
}

function ensureSuccessfulResponse(response: Response) {
    const code = response.code;
    if (code !== 200) {
        const message = response.message || '发生了未知错误';
        throw new QingLongAPIError(message);
    }
}

export {
    initializeQingLongAPIClient,
    updateEnvironmentVariables
}