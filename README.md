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
This will automatically update the /dist build folder with the changes so that the debug enviornment is always up to date.

1. Open `/src/extension.ts`
2. Press `F5`
3. In the Select Environment Prompt, select `VS Code Extension Development (preview)`
  - This will open up a new vs code window with the extension installed
  - Use the debug console to view debug logs and errors within this window
4. Open up a new file/folder, and start coding.
5. Copy Paste to see the changes reflected in the source doc interface(shown below).
