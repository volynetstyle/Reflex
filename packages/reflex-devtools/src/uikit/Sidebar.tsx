/** @jsxImportSource @volynets/reflex-dom */
import { createModel, signal } from "@volynets/reflex";
import "./Sidebar.css";

type NavItem = {
  id: string;
  label: string;
  icon: string; // emoji or icon name
};

const navItems: NavItem[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "discover", label: "Discover", icon: "📷" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "dashboard", label: "Dashboard", icon: "✓" },
  { id: "create", label: "Create", icon: "➕" },
  { id: "saved", label: "Saved Collections", icon: "📚" },
  { id: "profile", label: "Your Profile", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const sidebarModel = createModel((ctx) => {
  const [activeItem, setActiveItem] = signal<string>("home");
  const [isExpanded, setIsExpanded] = signal<boolean>(false);

  return {
    activeItem,
    isExpanded,
    setActiveItem: ctx.action((id: string) => setActiveItem(id)),
    toggleExpanded: ctx.action(() => setIsExpanded((prev) => !prev)),
    collapse: ctx.action(() => setIsExpanded(false)),
    expand: ctx.action(() => setIsExpanded(true)),
  };
});

export const Sidebar = () => {
  const { activeItem, isExpanded, setActiveItem, collapse, expand } =
    sidebarModel();

  return (
    <div class={`sidebar ${isExpanded() ? "expanded" : "collapsed"}`}>
      <nav class="sidebar-nav">
        {/* Top Items */}
        <div class="nav-group">
          {navItems.map((item) => (
            <button
              class={`nav-item ${activeItem() === item.id ? "active" : ""}`}
              onClick={() => setActiveItem(item.id)}
              title={item.label}
            >
              <div class="nav-item-icon">{item.icon}</div>
              {isExpanded() && <span class="nav-item-label">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Divider for spacing */}
        <div class="nav-spacer" />

        {/* Bottom Item - Flame/Fire Icon */}
        <div class="nav-group bottom-group">
          <button class="nav-item bottom-item" title="Upgrade">
            <div class="nav-item-icon">🔥</div>
            {isExpanded() && (
              <span class="nav-item-label">Premium Features</span>
            )}
          </button>
        </div>
      </nav>

      {/* Sidebar Toggle Buttons */}
      {isExpanded() && (
        <button
          class="sidebar-toggle left"
          onClick={() => collapse()}
          title="Collapse sidebar"
        >
          ‹
        </button>
      )}
      {!isExpanded() && (
        <button
          class="sidebar-toggle right"
          onClick={() => expand()}
          title="Expand sidebar"
        >
          ›
        </button>
      )}
    </div>
  );
};
