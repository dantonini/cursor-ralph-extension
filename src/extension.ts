import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    console.log('Ralph Extension is now active!');

    // Register a command
    let disposable = vscode.commands.registerCommand('ralph-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Ralph Extension!');
    });

    // Register command to execute sequence: focus IDE → Option+Cmd+B → Cmd+T → paste "123"
    let typeCommand = vscode.commands.registerCommand('ralph-extension.typeHelloWorld', async () => {
        // Step 1: Find all files matching ralph-prompt.* pattern
        const files = await vscode.workspace.findFiles('**/ralph-prompt.*', null, 100);

        if (files.length === 0) {
            vscode.window.showErrorMessage('No files found matching pattern ralph-prompt.*');
            return;
        }

        // Step 2: Let user select a file
        const fileItems = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),
            description: file.fsPath,
            file: file
        }));

        const selected = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'Select a ralph-prompt file'
        });

        if (!selected) {
            // User cancelled
            return;
        }

        // Step 3: Read the file content
        let fileContent: string;
        try {
            const document = await vscode.workspace.openTextDocument(selected.file);
            fileContent = document.getText();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read file: ${error}`);
            return;
        }

        // Step 4: Focus the entire IDE window/editor
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 5: Copy the file content to clipboard
        await vscode.env.clipboard.writeText(fileContent);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 6: Execute Option + Command + B
        await vscode.commands.executeCommand('composerMode.agent');
        await new Promise(resolve => setTimeout(resolve, 100));

        /*
        // Step 7: Execute Command + T (Quick Open dialog)
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        await new Promise(resolve => setTimeout(resolve, 150));
*/
        // Step 7: Paste the text using Command+V
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 8: Press Enter to trigger the action
        // Use native macOS keyboard simulation since type command doesn't work in custom panels
        // This simulates a real Enter keypress at the OS level using AppleScript
        try {
            // Small delay to ensure paste is complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Use AppleScript to simulate Enter keypress on macOS
            // Note: This requires Accessibility permissions in System Settings
            await execAsync('osascript -e "tell application \\"System Events\\" to keystroke return"');
        } catch (error) {
            console.log('Native keyboard simulation failed:', error);
            // Fallback: Try VS Code type command (though it likely won't work)
            try {
                await vscode.commands.executeCommand('type', { text: '\n' });
            } catch (error2) {
                console.log('Type command also failed:', error2);
                // Last resort: Try accept command
                try {
                    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
                } catch (error3) {
                    console.log('All methods failed:', error3);
                }
            }
        }
    });

    context.subscriptions.push(disposable, typeCommand);
}

export function deactivate() { }

