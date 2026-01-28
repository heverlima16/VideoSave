# Coding Guidelines for VideoSave

## CSS Class Assignment Best Practices

### Problem Statement Review

**Question:** What is wrong with this code, or is everything fine?
```javascript
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link .mud-nav-link-icon" : "";
```

**Answer:** There is an ERROR in this code.

### The Error
The string contains `.mud-nav-link-icon` where the period (`.`) should NOT be present. The period is CSS selector syntax used to select elements with a class, but when assigning classes to an element, you should only use the class name itself.

### The Fix
```javascript
// ❌ WRONG - Contains CSS selector syntax
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link .mud-nav-link-icon" : "";

// ✅ CORRECT - Only class names
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link mud-nav-link-icon" : "";
```

## Quick Reference

| Context | Syntax | Example |
|---------|--------|---------|
| **CSS Selectors** | Use `.` prefix | `.my-class { color: red; }` |
| **JavaScript className** | No prefix | `element.className = "my-class"` |
| **JavaScript classList** | No prefix | `element.classList.add("my-class")` |
| **HTML class attribute** | No prefix | `<div class="my-class">` |
| **jQuery selectors** | Use `.` prefix | `$(".my-class")` |

## Common Mistakes to Avoid

### 1. CSS Selector Syntax in Class Assignment
```javascript
// ❌ WRONG
element.className = ".button-primary .icon-large";

// ✅ CORRECT
element.className = "button-primary icon-large";
```

### 2. ID Selector Syntax in Class Assignment
```javascript
// ❌ WRONG
element.className = "#main-container";

// ✅ CORRECT
element.id = "main-container"; // For IDs
// OR
element.className = "main-container"; // For classes
```

### 3. Mixed Selector Syntax
```javascript
// ❌ WRONG
element.className = "nav-item > .nav-link";

// ✅ CORRECT
element.className = "nav-item nav-link";
```

## Validation Tips

When working with CSS classes in JavaScript:

1. **Remember**: Selectors use `.` or `#`, but class names don't include these
2. **Check**: Your class strings should only contain letters, numbers, hyphens, and underscores (plus spaces to separate multiple classes)
3. **Test**: If your styles aren't applying, check if you accidentally included selector syntax in the class name
4. **Use DevTools**: Inspect the element in browser DevTools to see the actual class names applied

## Related Issues

This type of error typically causes:
- CSS styles not applying to elements
- JavaScript class checks failing (`element.classList.contains("class-name")` would fail)
- Selector queries not finding the elements as expected
- Unexpected behavior in UI frameworks (like MudBlazor, React, Vue, etc.)

## For This Project

In the VideoSave project, we follow these practices:

```javascript
// Correct patterns used in our codebase
elements.detectedPlatform.className = `platform-badge ${platform}`;
elements.status.classList.add('offline');
elements.videoInfo.classList.add('show');
```

Always use clean class names without CSS selector syntax!
