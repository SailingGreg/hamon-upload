import React from "react";

class Header extends React.Component {
  render() {
    return (
      <div
        style={{ display: "flex", flexDirection: "row", alignItems: "center" }}
      >
        <img
          src="static/images/house_logo.png"
          alt="Household Automation"
          style={{ width: 25, height: 25, marginRight: 10 }}
        ></img>
        <p>HOME Configuration Utility </p>
      </div>
    );
  }
}

export default Header;
