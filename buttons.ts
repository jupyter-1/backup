import * as KernelMessage from '@jupyterlab/services/lib/kernel/messages';
import { IModel } from '@jupyterlab/services/lib/kernel/restapi';
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { KernelManager } from '@jupyterlab/services';
import { JupyterLab } from '@jupyterlab/application';

interface IOption {
  cell_type: string;
  code: string;
  label: string;
}
function delay(second: number) {
  return new Promise(resolve => {
    setTimeout(() => resolve(second), second * 1000);
  });
}

function wait(callback: any, times: number) {
  let count = 0;
  let stop = false;
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
async function waitFor(callback: any, count = 20) {
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

export async function buttons(output: IRenderMime.IRenderer, mimeType: string) {
  const kernelManager = new KernelManager();
  await kernelManager.ready;
  const runningKernel = [...kernelManager.running()];
  if (runningKernel.length === 0) {
    console.log('no running kernel...');
    return;
  }
  const notebook = await waitFor(
    () => output?.parent?.parent?.parent?.parent?.parent as any
  );
  if (!notebook) {
    console.log('no notebook...');
    return;
  }
  // get kernel from current notebook
  let kernel = await waitFor(
    () => notebook?.parent?.context?.sessionContext?.session?.kernel
  );
  if (!kernel) {
    console.log('no kernel from notebook...');
    const model = (await kernelManager.findById(runningKernel[0].id)) as IModel;
    kernel = kernelManager.connectTo({ model });
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

  const listener = async (option: IOption) => {
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
    const resp = await future.done;
    console.log(resp, '====future.done');
    let data = '';
    if (resp.content.status === 'error') {
      console.log(resp.content.traceback.join('\n'));
    } else {
      if (resp.content.status !== 'abort') {
        data = resp.content.user_expressions['output']['data']['text/plain'];
      }
    }
    const currentCell = output?.parent?.parent?.parent?.parent as any;
    const cellsArray = notebook.widgets;
    const index = cellsArray.findIndex((item: any) => item === currentCell);
    const sharedModel = notebook.model.sharedModel;
    sharedModel.insertCell(index + 1, {
      cell_type: option.cell_type,
      metadata:
        notebook.notebookConfig.defaultCell === 'code'
          ? {
              // This is an empty cell created by user, thus is trusted
              trusted: true
            }
          : {}
    });
    // let animationId: number;
    const newCell = notebook.widgets[index + 1];
    wait(() => {
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
      return false;
    }, 20);
  };
  const buttonList = buttonOptions.map((option: IOption) => {
    const btn = createButton(option);
    btn.addEventListener('click', () => listener(option));
    return btn;
  });

  if (
    runningKernel.length > 0 &&
    mimeType === 'application/vnd.jupyter.stderr'
  ) {
    buttonList.forEach(btn => output.node.appendChild(btn));
  }
}
