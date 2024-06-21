import * as util from "node:util";
import axios from 'axios';
import {DWClient, DWClientDownStream, RobotMessage, TOPIC_ROBOT} from 'dingtalk-stream';
import {Command, USAGE_HELP_TEXT} from '../constants.js';
import {DingTalkMessage} from '../model/dingtalk.js';
import {updateEnvironmentVariables, getAllEnvironmentVariableKeys} from '../api/qinglong.js';
import {getErrorMessage} from '../util/error_utils.js';

let client: DWClient;

function registerDingTalkStreamClient() {
    const clientId = process.env.DINGTALK_CLIENT_ID;
    const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.warn('钉钉机器人配置不完整，跳过注册钉钉机器人');
        return;
    }

    client = new DWClient({
        clientId: clientId,
        clientSecret: clientSecret
    });

    client.registerCallbackListener(TOPIC_ROBOT, onBotMessage)
        .connect()
        .then(() => console.info('钉钉机器人注册成功'));
}

const onBotMessage = async (event: DWClientDownStream) => {
    const message = JSON.parse(event.data) as RobotMessage;
    const [command, content] = (message?.text?.content || '').trim().split('#');

    let responseMessage: string;
    switch (command) {
        case Command.GET_ALL_ENV: {
            const allEnvKeys = await getAllEnvironmentVariableKeys();
            responseMessage = `环境变量列表:\n${allEnvKeys.join('\n')}`;
            break;
        }
        case Command.UPDATE_ENV: {
            responseMessage = await handleUpdateEnv(content);
            break;
        }
        default: {
            responseMessage = util.format(
                USAGE_HELP_TEXT,
                Object.values(Command).map(key => `\`${key}\``).join('，')
            ).trim();
            break;
        }
    }

    const accessToken = await client.getAccessToken();
    const messageBody: DingTalkMessage = {
        msgtype: 'markdown',
        markdown: {
            title: '执行结果',
            text: responseMessage
        },
        at: {
            atUserIds: message?.senderStaffId || ''
        }
    };

    const replyMessageResponse = await axios.post(
        message.sessionWebhook,
        messageBody,
        {
            responseType: 'json',
            headers: {
                'x-acs-dingtalk-access-token': accessToken,
            }
        },
    );

    // 需要返回消息响应，否则服务端会在60秒后重发
    client.socketCallBackResponse(event.headers.messageId, replyMessageResponse.data);
}

async function handleUpdateEnv(content: string) {
    const [envKey, envValue] = content.split('=');

    let responseMessage: string;
    try {
        await updateEnvironmentVariables(envKey, envValue);
        responseMessage = `成功更新环境变量${envKey}`;
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        console.error(errorMessage);
        responseMessage = `环境变量更新失败，错误信息：${errorMessage}`;
    }

    return responseMessage;
}

export {
    registerDingTalkStreamClient,
}
