# SourceDoc | Reatltime Source Documentation + AI Footprints


This project is a vscode/cursor extension paired with a living program that will track copy/paste information, and will relay source infromation within an ide. This project also tracks users AI footprints 


## Setup
Here is the setup instructions to setup the enviornment.
```
cd SourceDoc
npm install
npm run compile
```
This will install all the neccary packages, as well as create a /dist folder in the project root which contains the neccesary files for vscode to run the program.

## Running the Program
Before you run the program, make sure to run:
```
npm run watch
```
This will automatically update the /dist build folder with the changes so that the debug environment is always up to date.

1. Open `/src/extension.ts`
2. Press `F5`
3. In the Select Environment Prompt, select `VS Code Extension Development (preview)`
  - This will open up a new VS Code window with the extension installed
  - Use the debug console to view debug logs and errors within this window
4. Open up a new file/folder, and start coding.
5. Copy and paste to see the changes reflected in the source doc interface(shown below).
<img width="1206" height="561" alt="image" src="https://github.com/user-attachments/assets/237cc540-5890-42a2-bf9e-532729dc87be" />


## SourceDoc Version History
### V1: Extension - Webview Implementation
This version contains a proof of concept for user-pasted code. It includes a webview panel for SourceDoc, which includes each documented portion of code, as well as additional information about human-pasted code.
<img width="787" height="579" alt="image" src="https://github.com/user-attachments/assets/5885733b-bc70-4400-8318-ed65e562e4e2" />

### V2: Extension - IDE-Based AI Footprints 
This version aims to include the IDE-based agentic sourcing for AI-generated/assisted code. This version plans to incorporate functionality for both Github Copilot and Cursor Agent to be properly sourced within a file's history. This version will also include persistent SourceDoc file history, so that sourcing can be reconstructed and saved each time the user accesses their codebase


