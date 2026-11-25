import 'dart:async';
import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
import 'package:mobile/api.dart';

const _codeKeys = <String, String>{
  'email_taken': 'error.email_taken',
  'invalid_credentials': 'error.invalid_credentials',
  'user_not_found': 'error.invalid_credentials',
  'invalid_body': 'error.invalid_input',
  'invalid_params': 'error.invalid_input',
  'invalid_email': 'error.invalid_email',
  'invalid_query': 'error.invalid_input',
  'active_reservation_exists': 'error.active_reservation',
  'table_not_free': 'error.table_not_free',
  'table_unavailable': 'error.table_unavailable',
  'invalid_guests': 'error.invalid_guests',
  'invalid_duration': 'error.invalid_duration',
  'forbidden': 'error.forbidden',
  'invalid_status': 'error.invalid_status',
  'reservation_not_found': 'error.not_found',
  'session_not_found': 'error.not_found',
  'order_not_found': 'error.not_found',
  'venue_not_found': 'error.not_found',
  'not_found': 'error.not_found',
  'session_closed': 'error.session_closed',
  'age_verification_required': 'error.age_verification_required',
  'age_check_pending': 'error.age_check_pending',
  'preorder_closed': 'error.preorder_closed',
  'preorder_disabled': 'error.preorder_disabled',
  'item_unavailable': 'error.item_unavailable',
  'invalid_items': 'error.invalid_input',
  'invalid_qr_token': 'error.invalid_qr_token',
  'invalid_reason': 'error.invalid_input',
  'wrong_password': 'error.wrong_password',
  'invalid_old_password': 'error.wrong_password',
  'password_required': 'error.password_required',
  'password_too_short': 'error.password_too_short',
  'password_required_first': 'error.password_required_first',
  'role_not_allowed': 'error.role_not_allowed',
  'file_required': 'error.invalid_input',
  'file_too_large': 'error.file_too_large',
  'link_required': 'error.google_link_required',
  'google_email_unverified': 'error.google_email_unverified',
  'invalid_google_token': 'error.google_unavailable',
  'google_unavailable': 'error.google_unavailable',
  'google_signin_disabled': 'error.google_unavailable',
  'google_linked_elsewhere': 'error.google_linked_elsewhere',
  'google_already_connected': 'error.google_already_connected',
};

String apiErrorKey(Object error) {
  if (error is ApiException) {
    final key = _codeKeys[error.code];
    if (key != null) return key;
    if (error.status == 401) return 'error.unauthorized';
    return 'common.error';
  }
  if (error is FormatException && error.message == 'invalid_qr_token') {
    return 'error.invalid_qr_token';
  }
  if (error is SocketException || error is TimeoutException || error is HttpException) {
    return 'error.network';
  }
  return 'common.error';
}

String apiErrorText(Object error) => apiErrorKey(error).tr();

String safeShortId(String id, [int length = 8]) {
  if (id.length <= length) return id;
  return id.substring(0, length);
}
