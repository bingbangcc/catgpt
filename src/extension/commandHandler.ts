/** @format */

import * as vscode from 'vscode';
import {generatePrompt} from '../utils';
import {streamRequest, loadFileVector, loadWebVector, loadTextVector} from '../utils/langchain';
import {request} from '../utils/request';

/** 登录BUC */
export const handleLogin = async (context: vscode.ExtensionContext) => {
  const AUTH_URL = 'https://fl-fastai.pre-fc.alibaba-inc.com//#/catgpt/auth'; //验证地址

  //注册回调监听
  vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
      const queryParams = new URLSearchParams(uri.query); //从回调获取用户
      if (queryParams.has('nickname') && queryParams.has('avatar')) {
        context.globalState.update(
          'user',
          JSON.stringify({
            nickname: queryParams.get('nickname'),
            avatar: queryParams.get('avatar'),
          }),
        );
        vscode.window.showInformationMessage('BUC登录成功~');
      } else {
        vscode.window.showErrorMessage('BUC登录失败，请稍后再试~');
      }
    },
  });

  const redirectUri = await vscode.env.asExternalUri(
    vscode.Uri.parse(`${vscode.env.uriScheme}://zhaoo.catgpt-copilot/`),
  ); //登录页面

  //打开页面
  await vscode.env.openExternal(
    vscode.Uri.parse(AUTH_URL).with({
      query: `redirect=${encodeURIComponent(redirectUri.toString(true))}`,
    }),
  );
};

/** 问答操作 */
export const handleTriggerChat = (key: string, type: string, chatViewProvider: any, extend: any = {}) => {
  let {showPrompt = true, content = '', editor} = extend;
  switch (type) {
    case 'edit-selector': //编辑器选中文本
      content = editor.document.getText(editor.selection);
      break;
    case 'input': //函数传入
      break;
  }
  content = content.trim();
  return chatViewProvider.search(generatePrompt(key, content), showPrompt); //执行搜索
};

/** 插入编辑器 */
export const handleEditInsert = async (editor: vscode.TextEditor, prompt: string, insertType: 'stream' | 'normal') => {
  const position = editor.selection.active; //插入位置
  vscode.commands.executeCommand('editor.action.insertLineAfter'); //光标锚到下一行

  //流式插入
  const streamInsert = (token: vscode.CancellationToken) => {
    return new Promise(resolve => {
      let line = 1,
        textTemp = '';
      streamRequest(prompt, ({section, done}) => {
        if (token.isCancellationRequested) return resolve(false);
        if (section.indexOf('\n') !== -1) {
          const matchs: any = section.match(/(.*)\n(.*)/);
          textTemp += matchs[1];
          editor.edit(editBuilder => editBuilder.insert(position.translate(line, 0), textTemp + '\n'));
          line++;
          textTemp = matchs[2];
        } else {
          textTemp += section;
        }
        if (done) {
          editor.edit(editBuilder => editBuilder.insert(position.translate(line, 0), textTemp + '\n'));
          return resolve(true);
        }
      });
    });
  };

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '猫猫正在努力思考，主人不要着急... 🍵',
      cancellable: true,
    },
    async (progress, token) => {
      if (insertType === 'stream') {
        await streamInsert(token);
      } else {
        const genCode = await request({messages: [{role: 'user', content: prompt}]});
        if (token.isCancellationRequested) return;
        editor.edit(editBuilder => editBuilder.insert(position.translate(1, 0), genCode));
      }
    },
  );
};

/** 向量加载下拉选择 */
export const handleLoadVector = () => {
  vscode.window.showQuickPick(['本地文件', '文本输入', '网页文档', '组件库 / 代码片段']).then(selectedOption => {
    switch (selectedOption) {
      case '本地文件':
        return handleFileVector();
      case '文本输入':
        return handleTextVector();
      case '网页文档':
        return handleWebVector();
    }
  });
};

/** 加载文件向量 */
export const handleFileVector = async () => {
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    title: '选择需要嵌入的文件或目录',
  });
  if (fileUri && fileUri[0]) {
    const selectedPath = fileUri[0].fsPath;
    try {
      await loadFileVector(selectedPath);
      vscode.window.showInformationMessage('文件向量转储成功，已载入上下文！');
    } catch (e) {
      vscode.window.showErrorMessage(`文件向量转储失败\n${e}`);
    }
  }
};

/** 加载页面向量 */
export const handleWebVector = async () => {
  const url = await vscode.window.showInputBox({
    prompt: '网页链接',
    placeHolder: '请输入网页链接，自动爬取页面内容',
  });
  if (url) {
    try {
      await loadWebVector(url);
      vscode.window.showInformationMessage('页面向量转储成功，已载入上下文！');
    } catch (e) {
      vscode.window.showErrorMessage(`页面向量转储失败\n${e}`);
    }
  }
};

/** 加载文本向量 */
export const handleTextVector = async () => {
  const text = await vscode.window.showInputBox({
    prompt: '文本',
    placeHolder: '请输入需要载入上下文的文本片段',
  });
  if (text) {
    try {
      await loadTextVector(text);
      vscode.window.showInformationMessage('文本向量转储成功，已载入上下文！');
    } catch (e) {
      vscode.window.showErrorMessage(`文本向量转储失败\n${e}`);
    }
  }
};
