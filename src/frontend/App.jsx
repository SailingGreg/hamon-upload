import React from "react";
import "./App.css";
import Header from "./components/Header";
import ConfigurationForm from "./components/ConfigurationForm";


function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Header />
      </header>
      <ConfigurationForm />
    </div>
  );
}

export default App;
