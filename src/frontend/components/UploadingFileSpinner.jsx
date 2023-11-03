import React from "react";

const UploadingFileSpinner = ({ enabled }) => {
  if (!enabled) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        height: '100%',
        width: '100%',
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,.5)",
      }}
    >
      <div
        style={{
          backgroundColor: "black",
          padding: "1rem",
          borderColor: "white",
          borderWidth: 2,
          borderStyle: "solid",
        }}
      >
        <span>Please wait, uploading and parsing file...</span>
      </div>
    </div>
  );
};

export default UploadingFileSpinner;
