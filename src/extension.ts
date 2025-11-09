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
        const predefinedText = '123\n456\n789';

        // Step 1: Focus the entire IDE window/editor
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 2: Copy the predefined text to clipboard
        await vscode.env.clipboard.writeText(predefinedText);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 3: Execute Option + Command + B
        await vscode.commands.executeCommand('composerMode.agent');
        await new Promise(resolve => setTimeout(resolve, 100));

        /*
        // Step 4: Execute Command + T (Quick Open dialog)
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        await new Promise(resolve => setTimeout(resolve, 150));
*/
        // Step 5: Paste the text using Command+V
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Step 6: Press Enter to trigger the action
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

