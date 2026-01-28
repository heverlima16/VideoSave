# VideoSave
Guarda Videos docker

## Common CSS Class Assignment Errors - Documentation

### ❌ Incorrect Pattern
When assigning CSS classes in JavaScript, a common error is to include CSS selector syntax (like `.` for class or `#` for ID) in the class name string:

```javascript
// WRONG: Contains a period (.) which is CSS selector syntax
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link .mud-nav-link-icon" : "";
```

### ✅ Correct Pattern
Class name strings should only contain the class names separated by spaces, without CSS selector syntax:

```javascript
// CORRECT: Only class names, no selector syntax
var claseGrupo = tieneHijoActivo ? "mud-nav-group-active custom-nav-link mud-nav-link-icon" : "";
```

### Why This Matters
- **CSS Selectors** use `.classname` to target elements with that class
- **Class Assignment** uses just `classname` (the actual class name without the dot)
- Including the dot in a class assignment will create a class literally named `.mud-nav-link-icon` (with the period as part of the name), which won't match your CSS rules

### Examples in Different Contexts

**HTML:**
```html
<!-- Correct -->
<div class="mud-nav-group-active custom-nav-link mud-nav-link-icon"></div>

<!-- Wrong -->
<div class="mud-nav-group-active custom-nav-link .mud-nav-link-icon"></div>
```

**JavaScript:**
```javascript
// Correct
element.className = "mud-nav-group-active custom-nav-link mud-nav-link-icon";

// Wrong
element.className = "mud-nav-group-active custom-nav-link .mud-nav-link-icon";
```

**CSS (for reference):**
```css
/* CSS uses the dot to SELECT elements with these classes */
.mud-nav-group-active { /* ... */ }
.custom-nav-link { /* ... */ }
.mud-nav-link-icon { /* ... */ }
```


