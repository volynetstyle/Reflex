import { createModel, signal } from "@volynets/reflex";
import "./Sidebar.css";

type NavItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
};

const navItems = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "discover", label: "Discover", icon: "📷" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "dashboard", label: "Dashboard", icon: "✓" },
  { id: "create", label: "Create", icon: "➕" },
  { id: "saved", label: "Saved Collections", icon: "📚" },
  { id: "profile", label: "Your Profile", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙️" },
] satisfies readonly NavItem[];

const sidebarModel = createModel((ctx) => {
  const [activeItem, setActiveItem] = signal("home");
  const [isExpanded, setIsExpanded] = signal(false);

  const selectItem = ctx.action((id: string) => {
    setActiveItem(id);
  });

  const toggleExpanded = ctx.action(() => {
    setIsExpanded((prev) => !prev);
  });

  return {
    activeItem,
    isExpanded,
    selectItem,
    toggleExpanded,
  };
});

export const Sidebar = () => {
  const {
    activeItem: selected,
    isExpanded: expanded,
    selectItem,
    toggleExpanded,
  } = sidebarModel();

  return (
    <aside
      class={`sidebar ${expanded() ? "expanded" : "collapsed"}`}
      aria-label="Primary navigation"
    >
      <nav class="sidebar-nav">
        <div class="nav-group">
          {navItems.map((item) => {
            const active = selected() === item.id;

            return (
              <button
                type="button"
                class={`nav-item ${active ? "active" : ""}`}
                onClick={() => selectItem(item.id)}
                title={expanded() ? undefined : item.label}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                <span class="nav-item-icon" aria-hidden="true">
                  {item.icon}
                </span>

                <span class="nav-item-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div class="nav-spacer" />

        <div class="nav-group bottom-group">
          <button
            type="button"
            class="nav-item bottom-item"
            title={expanded() ? undefined : "Upgrade"}
            aria-label="Premium Features"
          >
            <span class="nav-item-icon" aria-hidden="true">
              🔥
            </span>

            <span class="nav-item-label">Premium Features</span>
          </button>
        </div>
      </nav>

      <button
        type="button"
        class={`sidebar-toggle ${expanded() ? "left" : "right"}`}
        onClick={toggleExpanded}
        title={expanded() ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={expanded() ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={expanded()}
      >
        {expanded() ? "‹" : "›"}
      </button>
    </aside>
  );
};
