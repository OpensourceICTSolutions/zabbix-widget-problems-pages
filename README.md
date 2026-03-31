# Problems Pages

`Problems Pages` is a custom Zabbix dashboard widget based on the built-in Problems widget.

It adds simpler page navigation for time-descending problem lists while avoiding the expensive behavior of loading the full problem result set up to `search_limit` on every page change.

## What It Does

- Shows open problems in a dashboard widget.
- Keeps the standard Problems widget filters and display options.
- Adds page navigation to the widget footer.
- Optimizes `sort by time descending` paging so page 2, page 3, and later pages only fetch a bounded result window instead of the entire list.

## Why This Exists

The standard widget logic is fine for many use cases, but when the list is sorted by newest problems first, paging can become inefficient because the backend may prepare a much larger result set than the current page actually needs.

This custom widget changes that behavior:

- Page 1 loads only the first page window plus a small look-ahead buffer.
- Page 2 and later pages also load only a bounded window.
- The widget still performs the normal follow-up Zabbix queries needed to render the visible rows, such as trigger, tag, alert, host, and symptom lookups.

In practice, this means the main problems query is bounded with `LIMIT n` instead of loading the whole widget result set.

## Included Files

- `manifest.json`: module manifest
- `Widget.php`: widget entry point
- `actions/WidgetView.php`: backend data loading and paging logic
- `includes/WidgetProblems.php`: widget table and pager rendering
- `assets/js/class.widget.js`: frontend widget behavior
- `views/`: widget edit and display views

## Installation

1. Copy the `problems-pages` directory into your Zabbix modules/widgets location.
2. Make sure the final folder name remains `problems-pages`.
3. Ensure the web server user can read the files.
4. Open Zabbix.
5. Go to `Administration -> General -> Modules` if needed and make sure custom modules are enabled in your environment.
6. Open or create a dashboard.
7. Add the widget named `Problems Pages`.

If your Zabbix installation stores custom widgets in a project-specific modules path, place this folder there instead of replacing any core Zabbix files.

## Usage

1. Add the `Problems Pages` widget to a dashboard.
2. Configure filters the same way you would for the built-in Problems widget.
3. Set `Sort entries by` to time descending if you want the optimized paging behavior.
4. Use the footer pager to move between pages.

## Paging Behavior

For time-descending lists, the backend in `actions/WidgetView.php` uses bounded page fetches:

- It calculates the rows needed for the requested page.
- It requests a small extra buffer to determine whether a next page exists.
- It slices the final page in PHP after Zabbix finishes its normal trigger filtering.

This is important because some raw problem rows can be excluded later by Zabbix internals, so the widget requests a small amount of extra data to keep paging accurate.

## SQL Expectations

When the widget is working correctly, the main problem list query should look like this pattern in the Zabbix script profiler:

```sql
SELECT ... FROM problem ... ORDER BY p.eventid DESC LIMIT <small bounded number>
```

You should not see it loading the full `search_limit` result set just to render page 2 or page 3.

Follow-up queries for the currently fetched or visible rows are still expected. Those include:

- trigger lookups
- host lookups
- alert counters
- tags
- acknowledges
- symptom checks

## Compatibility Notes

- Built for Zabbix 7.x style widget modules.
- Developed against a Zabbix 7.0.x environment.
- It is a custom widget, not an official core Zabbix component.

## Known Limitations

- This package has not been linted locally in this workspace because PHP CLI is not available here.
- The workspace used to prepare this module is not currently a Git repository, so the files are ready for Git upload but were not committed or pushed from here.

## Suggested Git Upload Flow

1. Create a new Git repository.
2. Copy this `problems-pages` folder into that repository.
3. Review the files.
4. Commit the module.
5. Push to your remote hosting service.

## Credits

- Based on the Zabbix Problems widget structure.
- Customized and packaged as `Problems Pages` for bounded page loading and dashboard pager support.
