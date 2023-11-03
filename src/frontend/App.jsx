import React, { useState } from "react";
import "./App.css";
import Header from "./components/Header";
import ConfigurationForm from "./components/ConfigurationForm";
import UploadingFileSpinner from "./components/UploadingFileSpinner";

function App() {
  const [uploadingFile, setUploadingFile] = useState(false)
  return (
    <div className="App">
      <header className="App-header">
        <Header />
      </header>
      <ConfigurationForm uploadingFile={uploadingFile} setUploadingFile={setUploadingFile}/>
      <UploadingFileSpinner enabled={uploadingFile}/>
    </div>
  );
}

export default App;
