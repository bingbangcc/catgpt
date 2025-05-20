/** @format */

import {BaseChatModel} from 'langchain/chat_models/base';
import {BaseChatMessage, ChatResult} from 'langchain/dist/schema';
import {AIChatMessage} from 'langchain/schema';
import axios from 'axios';
import * as vscode from 'vscode';

export class Qwen2Model extends BaseChatModel {
  modelName: string;
  apiKey: string;
  temperature: number = 0;
  url: string;

  constructor(fields: any) {
    super(fields ?? {});

    const config = vscode.workspace.getConfiguration('catgpt');
    
    Object.defineProperty(this, 'temperature', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: fields?.temperature ?? 0,
    });

    this.modelName = 'qwen2-72b-instruct';
    this.apiKey = fields?.apiKey ?? config.get('apiKey') ?? '';
    this.url = "https://idealab.alibaba-inc.com/api/openai/v1/chat/completions";
  }

  invocationParams() {
    return {
      model: this.modelName,
      temperature: this.temperature,
    };
  }

  _identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
    };
  }

  identifyingParams() {
    return this._identifyingParams();
  }

  async _generate(messages: BaseChatMessage[]): Promise<ChatResult> {
    const formattedMessages = messages.map(message => {
      return {
        role: message._getType() === 'human' ? 'user' : message._getType() === 'ai' ? 'assistant' : 'system',
        content: message.text,
      };
    });

    const data = {
      messages: formattedMessages,
      model: this.modelName,
      stream: false,
    };

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios.post(this.url, data, { headers });
      const content = response.data.choices[0].message.content;
      
      const generations = [
        {
          text: content,
          message: new AIChatMessage(content),
        },
      ];
      
      return {
        generations,
      };
    } catch (error) {
      console.error("API调用错误:", error);
      throw error;
    }
  }

  _llmType() {
    return 'qwen2';
  }

  // 实现抽象方法
  _combineLLMOutput(...llmOutputs: any) {
    return llmOutputs.reduce(
      (acc: any, llmOutput: any) => {
        if (llmOutput && llmOutput.tokenUsage) {
          acc.tokenUsage.completionTokens += llmOutput.tokenUsage.completionTokens ?? 0;
          acc.tokenUsage.promptTokens += llmOutput.tokenUsage.promptTokens ?? 0;
          acc.tokenUsage.totalTokens += llmOutput.tokenUsage.totalTokens ?? 0;
        }
        return acc;
      },
      {
        tokenUsage: {
          completionTokens: 0,
          promptTokens: 0,
          totalTokens: 0,
        },
      },
    );
  }

  /** 流式请求方法，将在langchain.ts中使用 */
  async streamRequest(prompt: string, callbackFn: any) {
    const controller = new AbortController();
    
    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant."
      },
      {
        role: "user",
        content: prompt
      }
    ];

    const data = {
      messages: messages,
      stream: true,
      model: this.modelName
    };

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios.post(
        this.url,
        data,
        {
          headers,
          signal: controller.signal,
          responseType: 'stream'
        }
      );

      let content = '';
      
      response.data.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim() !== '');
        
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
                callbackFn({content, section, done: false});
              }
            }
          } catch (e) {
            console.error('流式解析错误:', e);
          }
        }
      });

      response.data.on('end', () => {
        callbackFn({content, section: '', done: true});
      });

      response.data.on('error', (error: any) => {
        console.error('流式请求错误:', error);
        callbackFn({content: '错误: ' + error, section: '错误: ' + error, done: true});
      });

    } catch (error) {
      console.error('API请求错误:', error);
      callbackFn({content: '错误: ' + error, section: '错误: ' + error, done: true});
    }

    return controller;
  }
} 