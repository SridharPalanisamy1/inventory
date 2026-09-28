

import React from 'react';
import { useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './common.css'; // Ensure this file is imported

interface SubMenuProps {
  subItems: string[];
}

const SubMenu: React.FC<SubMenuProps> = ({ subItems }) => {
  const navigate = useNavigate();

  const handleNavigation = (path: string) => {
    const formattedPath = path.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    navigate(`/${formattedPath}`);
  };

  return (
    <div className="submenu-container">
      {subItems.map((subItem, index) => (
        <button
          key={index}
          className="btn btn-navy-blue m-1" // Adding margin for spacing
          onClick={() => handleNavigation(subItem)}
        >
          {subItem}
        </button>
      ))}
    </div>
  );
};

export default SubMenu;
