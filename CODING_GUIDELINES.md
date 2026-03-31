# Coding Guidelines for VideoSave

## CSS Class Assignment Best Practices

This guide documents common patterns and errors to avoid when working with CSS classes in JavaScript, based on a code review question.

### Reference: Common Error Pattern

**External Example Question:** "What is wrong with this code?"
```javascript
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link .mud-nav-link-icon" : "";
```

**Answer:** The string contains `.mud-nav-link-icon` where the period (`.`) should NOT be present.

**Note:** This example is from an external code review - it is NOT present in this codebase. All class assignments in VideoSave are already correct.

### The Corrected Version
```javascript
// ✅ CORRECT - Only class names, no selector syntax
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link mud-nav-link-icon" : "";
```

### Why This Matters
- **CSS Selectors** use `.classname` to target elements
- **Class Assignments** use just `classname` (without the dot)
- Including the dot creates a class literally named `.mud-nav-link-icon` (with the period), which won't match CSS rules

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
- JavaScript class checks would fail (e.g., `element.classList.contains("class-name")` would not find the class)
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
