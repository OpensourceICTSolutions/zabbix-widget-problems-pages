/*
** Copyright (C) 2001-2026 Zabbix SIA
**
** This program is free software: you can redistribute it and/or modify it under the terms of
** the GNU Affero General Public License as published by the Free Software Foundation, version 3.
**
** This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
** without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
** See the GNU Affero General Public License for more details.
**
** You should have received a copy of the GNU Affero General Public License along with this program.
** If not, see <https://www.gnu.org/licenses/>.
**/


class CWidgetProblemsPages extends CWidget {

	/**
	 * Table body of problems.
	 *
	 * @type {HTMLElement|null}
	 */
	#table_body = null;

	/**
	 * ID of selected event.
	 *
	 * @type {string|null}
	 */
	#selected_eventid = null;

	/**
	 * Current page number.
	 *
	 * @type {number}
	 */
	#page = 1;

	/**
	 * Most recently requested page number.
	 *
	 * This is kept separate from the rendered page so a click to page 1 is still sent even if the
	 * local widget state has drifted back to the default page number.
	 *
	 * @type {number}
	 */
	#requested_page = 1;

	/**
	 * Whether the current pager is using cursor-based navigation.
	 *
	 * @type {boolean}
	 */
	#cursor_mode = false;

	/**
	 * Cursor used to load the current page.
	 *
	 * @type {string|null}
	 */
	#cursor_eventid = null;

	/**
	 * Most recently requested cursor.
	 *
	 * @type {string|null}
	 */
	#requested_cursor_eventid = null;

	/**
	 * Cursor to request the next page in cursor mode.
	 *
	 * @type {string|null}
	 */
	#next_cursor_eventid = null;

	/**
	 * Remember visited page cursors so Previous can navigate without reloading intermediate pages.
	 *
	 * @type {Map<number, string|null>}
	 */
	#page_cursors = new Map([[1, null]]);

	onInitialize() {
		this._opened_eventids = [];
	}

	onStart() {
		this._events = {
			...this._events,

			acknowledgeCreated: (e, response) => {
				clearMessages();
				addMessage(makeMessageBox('good', [], response.success.title));

				if (this._state === WIDGET_STATE_ACTIVE) {
					this._startUpdating();
				}
			},

			rankChanged: () => {
				if (this._state === WIDGET_STATE_ACTIVE) {
					this._startUpdating();
				}
			},
		}
	}

	onActivate() {
		$.subscribe('acknowledge.create', this._events.acknowledgeCreated);
		$.subscribe('event.rank_change', this._events.rankChanged);
	}

	onDeactivate() {
		$.unsubscribe('acknowledge.create', this._events.acknowledgeCreated);
		$.unsubscribe('event.rank_change', this._events.rankChanged);
	}

	setContents(response) {
		super.setContents(response);
		this.#page = response.page?.current ?? 1;
		this.#requested_page = this.#page;
		this.#cursor_mode = response.page?.cursor_mode ?? false;
		this.#cursor_eventid = response.page?.cursor_eventid ?? null;
		this.#requested_cursor_eventid = this.#cursor_eventid;
		this.#next_cursor_eventid = response.page?.next_cursor_eventid ?? null;

		if (this.#cursor_mode) {
			if (this.#page === 1 || this.#cursor_eventid === null) {
				this.#page_cursors = new Map([[1, null]]);
			}

			this.#page_cursors.set(this.#page, this.#cursor_eventid);

			if (this.#next_cursor_eventid !== null) {
				this.#page_cursors.set(this.#page + 1, this.#next_cursor_eventid);
			}
		}
		else {
			this.#page_cursors = new Map([[1, null]]);
			this.#cursor_eventid = null;
			this.#requested_cursor_eventid = null;
			this.#next_cursor_eventid = null;
		}

		this.#table_body = this._contents.querySelector(`.${ZBX_STYLE_LIST_TABLE} tbody`);

		if (this.#table_body === null) {
			return;
		}

		this.#activateContentsEvents();

		if (this.isReferred() && (this.isFieldsReferredDataUpdated() || !this.hasEverUpdated())) {
			if (this.#selected_eventid === null || !this.#hasSelectable()) {
				this.#selected_eventid = this.#getDefaultSelectable();
			}

			if (this.#selected_eventid !== null) {
				this.#selectEvent();
				this.#broadcast();
			}
		}
		else if (this.#selected_eventid !== null) {
			this.#selectEvent();
		}
	}

	onReferredUpdate() {
		if (this.#table_body === null || this.#selected_eventid !== null) {
			return;
		}

		this.#selected_eventid = this.#getDefaultSelectable();

		if (this.#selected_eventid !== null) {
			this.#selectEvent();
			this.#broadcast();
		}
	}

	#getDefaultSelectable() {
		const row = this.#table_body.querySelector('[data-eventid]');

		return row !== null ? row.dataset.eventid : null;
	}

	#hasSelectable() {
		return this.#table_body.querySelector(`[data-eventid="${this.#selected_eventid}"]`) !== null;
	}

	#activateContentsEvents() {
		for (const button of this._body.querySelectorAll('button[data-action="show_symptoms"]')) {
			button.addEventListener('click', e => this.#onShowSymptoms(e));

			// Open the symptom block for previously clicked problems when content is reloaded.
			if (this._opened_eventids.includes(button.dataset.eventid)) {
				const rows = this._body.querySelectorAll(`[data-cause-eventid="${button.dataset.eventid}"]`);

				[...rows].forEach(row => row.classList.remove('hidden'));

				button.classList.remove(ZBX_ICON_CHEVRON_DOWN, ZBX_STYLE_COLLAPSED);
				button.classList.add(ZBX_ICON_CHEVRON_UP);
				button.title = t('Collapse');
			}
		}

		for (const button of this._contents.querySelectorAll('button[data-action="page"]')) {
			button.addEventListener('click', e => this.#onPageClick(e));
		}

		this.#table_body?.addEventListener('click', e => this.#onTableBodyClick(e));
	}

	getUpdateRequestData() {
		const request_data = {
			...super.getUpdateRequestData(),
			page: this.#requested_page
		};

		if (this.#requested_cursor_eventid !== null) {
			request_data.cursor_eventid = this.#requested_cursor_eventid;
		}

		return request_data;
	}

	#selectEvent() {
		const rows = this.#table_body.querySelectorAll('[data-eventid]');

		for (const row of rows) {
			row.classList.toggle(ZBX_STYLE_ROW_SELECTED, row.dataset.eventid === this.#selected_eventid);
		}
	}

	#onShowSymptoms(e) {
		const button = e.target;

		// Disable the button to prevent multiple clicks.
		button.disabled = true;

		const rows = this._body.querySelectorAll(`[data-cause-eventid="${button.dataset.eventid}"]`);

		if (rows[0].classList.contains('hidden')) {
			button.classList.remove(ZBX_ICON_CHEVRON_DOWN, ZBX_STYLE_COLLAPSED);
			button.classList.add(ZBX_ICON_CHEVRON_UP);
			button.title = t('Collapse');

			this._opened_eventids.push(button.dataset.eventid);

			[...rows].forEach(row => row.classList.remove('hidden'));
		}
		else {
			button.classList.remove(ZBX_ICON_CHEVRON_UP);
			button.classList.add(ZBX_ICON_CHEVRON_DOWN, ZBX_STYLE_COLLAPSED);
			button.title = t('Expand');

			this._opened_eventids = this._opened_eventids.filter(id => id !== button.dataset.eventid);

			[...rows].forEach(row => row.classList.add('hidden'));
		}

		// When complete enable button again.
		button.disabled = false;
	}

	#broadcast() {
		this.broadcast({[CWidgetsData.DATA_TYPE_EVENT_ID]: [this.#selected_eventid]});
	}

	#onPageClick(e) {
		const button = e.currentTarget?.matches?.('[data-action="page"]')
			? e.currentTarget
			: e.target.closest('[data-action="page"]');

		if (button === null) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		const page_action = button.dataset.pageAction ?? '';

		if (page_action !== '') {
			let next_page = this.#page;
			let next_cursor_eventid = this.#cursor_eventid;

			if (page_action === 'previous') {
				next_page = Math.max(this.#page - 1, 1);
				next_cursor_eventid = this.#page_cursors.get(next_page) ?? null;
			}
			else if (page_action === 'next') {
				next_page = this.#page + 1;
				next_cursor_eventid = this.#page_cursors.get(next_page) ?? this.#next_cursor_eventid;
			}
			else {
				return;
			}

			this.#cursor_mode = true;
			this.#page = next_page;
			this.#requested_page = next_page;
			this.#requested_cursor_eventid = next_cursor_eventid;
			this._startUpdating();
			return;
		}

		const page = Number.parseInt(button.dataset.page ?? '1', 10);

		if (Number.isNaN(page) || page < 1) {
			return;
		}

		this.#page = page;
		this.#requested_page = page;
		this.#requested_cursor_eventid = null;
		this._startUpdating();
	}

	#onTableBodyClick(e) {
		if (e.target.closest('a') !== null || e.target.closest('[data-hintbox="1"]') !== null) {
			return;
		}

		const row = e.target.closest('[data-eventid]');

		if (row !== null) {
			this.#selected_eventid = row.dataset.eventid;

			this.#selectEvent();
			this.#broadcast();
		}
	}
}
