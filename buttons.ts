import { IModel } from '@jupyterlab/services/lib/kernel/restapi';
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { KernelManager } from '@jupyterlab/services';

export async function buttons(output: IRenderMime.IRenderer, mimeType: string) {
  const kernelManager = new KernelManager();
  await kernelManager.ready;
  const runningKernel = [...kernelManager.running()];
  if (runningKernel.length === 0) {
    return;
  }

  const btnFix = document.createElement('button');
  btnFix.innerText = 'Fix Error';
  btnFix.type = 'button';
  btnFix.classList.add('jp-Button');
  btnFix.classList.add('jp-mod-small');
  btnFix.style.marginRight = '12px';
  btnFix.addEventListener('click', async () => {
    const model = (await kernelManager.findById(runningKernel[0].id)) as IModel;
    const kernel = kernelManager.connectTo({ model });
    const future = kernel.requestExecute({
      code: 'result="hello world" \nprint(result)',
      user_expressions: {
        output: 'result'
      }
    });
    future.onIOPub = msg => {
      if (msg.header.msg_type !== 'status') {
        console.log(msg.content);
      }
    };
    future.onStdin = msg => {
      console.log(msg);
    };
    const resp = await future.done;
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
    if (output) {
      const notebook = output?.parent?.parent?.parent?.parent?.parent as any;
      const currentCell = output?.parent?.parent?.parent?.parent as any;
      const cellsArray = notebook.widgets;
      const index = cellsArray.findIndex((item: any) => item === currentCell);
      const sharedModel = notebook.model.sharedModel;
      sharedModel.insertCell(index + 1, {
        cell_type: notebook.notebookConfig.defaultCell,
        metadata:
          notebook.notebookConfig.defaultCell === 'code'
            ? {
                // This is an empty cell created by user, thus is trusted
                trusted: true
              }
            : {}
      });
      let animationId: number;
      const newCell = notebook.widgets[index + 1];
      function waitEditor() {
        if (newCell.editor && newCell.editor.editor) {
          newCell.editor.editor.dispatch({
            changes: { from: 0, insert: data }
          });
          newCell.editor.focus();
          cancelAnimationFrame(animationId);
        } else {
          animationId = requestAnimationFrame(waitEditor);
        }
      }
      waitEditor();
    }
  });

  const btnExp = document.createElement('button');
  btnExp.innerText = 'Show Error Explanation';
  btnExp.type = 'button';
  btnExp.classList.add('jp-Button');
  btnExp.classList.add('jp-mod-small');
  btnExp.addEventListener('click', () => {});
  if (
    runningKernel.length > 0 &&
    mimeType === 'application/vnd.jupyter.stderr'
  ) {
    output.node.appendChild(btnFix);
    output.node.appendChild(btnExp);
  }
}
