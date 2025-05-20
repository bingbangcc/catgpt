/** @format */

import axios from 'axios';
import {get} from 'lodash';
import * as vscode from 'vscode';
import {StreamRequestCbParams} from '../@types/utils';
import './fetch-polyfill';

const config = vscode.workspace.getConfiguration('catgpt'); //vscode配置
const API_KEY: string = config.get('apiKey') || '11f48045d403f6a2894e7b87b61477a6'; //秘钥
const BASE_URL: string = 'https://idealab.alibaba-inc.com/api/openai/v1'; //API地址

/** 普通请求 */
export const request = async (params: any, cb?: (params: StreamRequestCbParams) => void) => {
  try {
    const response = await axios({
      url: BASE_URL + '/chat/completions',
      method: 'post',
      data: JSON.stringify({
        model: 'qwen2-72b-instruct',
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 2048,
        temperature: 0,
        top_p: 0,
        stream: false,
        ...params,
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + API_KEY,
      },
    });
    const content = get(response, 'data.choices[0].message.content');
    cb && cb({content, section: content, done: true});
    return content;
  } catch (e) {
    console.error('普通请求错误: ' + e);
  }
};

/** 流式请求 */
export const streamRequest = async (params: any, cb: (params: StreamRequestCbParams) => void) => {
  const cancelToken = axios.CancelToken.source(); //中断标识
  try {
    const response = await axios({
      url: BASE_URL + '/chat/completions',
      method: 'post',
      data: JSON.stringify({
        model: 'qwen2-72b-instruct',
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 2048,
        temperature: 0,
        top_p: 0,
        stream: true,
        ...params,
      }),
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + API_KEY,
      },
      cancelToken: cancelToken.token,
      responseType: 'stream',
    });

    //流式输出
    let content = '';
    response.data.on('data', (data: Buffer) => {
      const lines = data
        .toString()
        .split('\n')
        .filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (!line || line === '[DONE]') continue;
        
        let message = line;
        if (line.startsWith("data: ")) {
          message = line.substring(6);
        }

        try {
          const jsonData = JSON.parse(message);
          if ('choices' in jsonData && jsonData.choices.length > 0) {
            const delta = jsonData.choices[0].delta;
            if (delta && 'content' in delta) {
              const section = delta.content;
              content += section;
              cb({content, section, done: false});
            }
          }
        } catch (e) {
          console.error('流式解析错误:', e);
        }
      }
    });

    //输出结束
    response.data.on('end', () => {
      cb({content, section: '', done: true});
    });
  } catch (e) {
    console.error('流式请求错误: ' + e);
  }
  return cancelToken;
};
