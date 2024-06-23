import { ISharedNotebook } from '@jupyter/ydoc';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import * as KernelMessage from '@jupyterlab/services/lib/kernel/messages';
import { IModel } from '@jupyterlab/services/lib/kernel/restapi';
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { KernelManager } from '@jupyterlab/services';
import { JupyterLab } from '@jupyterlab/application';
import { Widget } from '@lumino/widgets/types/widget';
interface IOption {
  cell_type: string;
  code: string;
  label: string;
}

interface ICallback<T> {
  (): T;
}

function delay(second: number) {
  return new Promise(resolve => {
    setTimeout(() => resolve(second), second * 1000);
  });
}

function wait<T>(callback: ICallback<T>, times: number) {
  let count = 0;
  let stop: T;
  function loop() {
    if (count >= times) {
      return null;
    }
    stop = callback();
    if (stop) {
      return stop;
    }
    count++;
    requestAnimationFrame(loop);
  }
  return loop();
}
function createButton(option: IOption) {
  const btn = document.createElement('button');
  btn.innerText = option.label;
  btn.type = 'button';
  btn.classList.add('jp-Button');
  btn.classList.add('jp-mod-small');
  btn.style.marginRight = '12px';
  return btn;
}
async function waitFor<T>(callback: ICallback<T>, count = 20) {
  const result = callback();
  if (result) {
    return result;
  }
  if (count === 0) {
    return null;
  }
  await delay(0.05);
  return waitFor(callback, count - 1);
}

const listener = async (
  option: IOption,
  kernel: IKernelConnection,
  output: any,
  notebook: any
) => {
  const future = kernel.requestExecute({
    code: option.code,
    user_expressions: {
      output: 'result'
    }
  });
  future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
    if (msg.header.msg_type !== 'status') {
      console.log(msg.content);
    }
  };
  const resp: KernelMessage.IExecuteReplyMsg = await future.done;
  console.log(resp, '====future.done');
  let data = '';
  if (resp.content.status === 'error') {
    console.log(resp.content.traceback.join('\n'));
  } else {
    if (resp.content.status !== 'abort') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      data = resp.content.user_expressions['output']['data']['text/plain'];
    }
  }
  const currentCell = output?.parent?.parent?.parent?.parent as Widget;
  const cellsArray: Widget[] = notebook.widgets;
  const index = cellsArray.findIndex((item: Widget) => item === currentCell);
  const sharedModel: ISharedNotebook = notebook.model.sharedModel;
  sharedModel.insertCell(index + 1, {
    cell_type: option.cell_type,
    metadata:
      option.cell_type === 'code'
        ? {
            // This is an empty cell created by user, thus is trusted
            trusted: true
          }
        : {}
  });
  const newCell = notebook.widgets[index + 1];
  wait<CodeEditor.IEditor>(() => {
    if (newCell.editor && newCell.editor.editor) {
      newCell.editor.editor.dispatch({
        changes: { from: 0, insert: data }
      });
      newCell.editor.focus();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const app = window.jupyterapp as JupyterLab;
      app.commands.execute('notebook:run-cell-and-select-next', {
        toolbar: true
      });
      return newCell.editor.editor;
    }
    return null;
  }, 20);
};

export async function buttons(output: IRenderMime.IRenderer, mimeType: string) {
  const kernelManager = new KernelManager();
  await kernelManager.ready;
  const runningKernel = [...kernelManager.running()];
  if (runningKernel.length === 0) {
    console.log('no running kernel...');
    return;
  }
  const notebook = await waitFor<any>(
    () => output?.parent?.parent?.parent?.parent?.parent
  );
  if (!notebook) {
    console.log('no notebook...');
    return;
  }
  // get kernel from current notebook
  let kernel = (await waitFor<IKernelConnection>(
    () => notebook?.parent?.context?.sessionContext?.session?.kernel
  )) as IKernelConnection;
  if (!kernel) {
    console.log('no kernel from notebook...');
    const model = (await kernelManager.findById(runningKernel[0].id)) as IModel;
    kernel = kernelManager.connectTo({ model }) as IKernelConnection;
  }
  if (!kernel) {
    console.log('no kernel from kernelManager...');
    return;
  }
  const buttonOptions: IOption[] = [
    {
      code: 'result="hello world" \nprint(result)',
      label: 'Fix Error',
      cell_type: 'code'
    },
    {
      code: 'result="hello world" \nprint(result)',
      label: 'Show Error Explanation',
      cell_type: 'markdown'
    }
  ];

  const buttonList = buttonOptions.map((option: IOption) => {
    const btn = createButton(option);
    btn.addEventListener('click', () =>
      listener(option, kernel, output, notebook)
    );
    return btn;
  });

  if (
    runningKernel.length > 0 &&
    mimeType === 'application/vnd.jupyter.stderr'
  ) {
    buttonList.forEach(btn => output.node.appendChild(btn));
  }
}
