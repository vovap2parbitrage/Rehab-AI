import streamlit as st
import cv2
import numpy as np
import json
import tempfile
import os
from scipy.spatial.distance import cdist
from streamlit_webrtc import webrtc_streamer, VideoProcessorBase, RTCConfiguration

import mediapipe as mp
from mediapipe.python.solutions import pose as mp_pose
from mediapipe.python.solutions import drawing_utils as mp_drawing

# WebRTC конфігурація для браузера
RTC_CONFIGURATION = RTCConfiguration(
    {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]}
)

# Словник зрозумілих назв суглобів та їх індексів
JOINTS_DICT = {
    0: "Лівий лікоть (l_elbow)",
    1: "Правий лікоть (r_elbow)",
    2: "Ліве коліно (l_knee)",
    3: "Праве коліно (r_knee)",
    4: "Лівий таз / спина (l_hip)",
    5: "Правий таз / спина (r_hip)",
    6: "Ліве плече (l_shoulder)",
    7: "Праве плече (r_shoulder)"
}


def calculate_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360.0 - angle
    return angle


def extract_key_angles(landmarks):
    get_pt = lambda lm: [landmarks[lm].x, landmarks[lm].y]

    l_shoulder, l_elbow, l_wrist = get_pt(mp_pose.PoseLandmark.LEFT_SHOULDER.value), get_pt(
        mp_pose.PoseLandmark.LEFT_ELBOW.value), get_pt(mp_pose.PoseLandmark.LEFT_WRIST.value)
    l_hip, l_knee, l_ankle = get_pt(mp_pose.PoseLandmark.LEFT_HIP.value), get_pt(
        mp_pose.PoseLandmark.LEFT_KNEE.value), get_pt(mp_pose.PoseLandmark.LEFT_ANKLE.value)

    r_shoulder, r_elbow, r_wrist = get_pt(mp_pose.PoseLandmark.RIGHT_SHOULDER.value), get_pt(
        mp_pose.PoseLandmark.RIGHT_ELBOW.value), get_pt(mp_pose.PoseLandmark.RIGHT_WRIST.value)
    r_hip, r_knee, r_ankle = get_pt(mp_pose.PoseLandmark.RIGHT_HIP.value), get_pt(
        mp_pose.PoseLandmark.RIGHT_KNEE.value), get_pt(mp_pose.PoseLandmark.RIGHT_ANKLE.value)

    return [
        calculate_angle(l_shoulder, l_elbow, l_wrist),  # 0
        calculate_angle(r_shoulder, r_elbow, r_wrist),  # 1
        calculate_angle(l_hip, l_knee, l_ankle),  # 2
        calculate_angle(r_hip, r_knee, r_ankle),  # 3
        calculate_angle(l_shoulder, l_hip, l_knee),  # 4
        calculate_angle(r_shoulder, r_hip, r_knee),  # 5
        calculate_angle(l_hip, l_shoulder, l_elbow),  # 6
        calculate_angle(r_shoulder, r_elbow, r_elbow)  # 7
    ]


def compute_dtw_mapping(seq1, seq2):
    dist_matrix = cdist(seq1, seq2, metric='euclidean')
    N, M = dist_matrix.shape
    cost = np.zeros((N, M))
    cost[0, 0] = dist_matrix[0, 0]
    cost[1:, 0] = np.cumsum(dist_matrix[1:, 0]) + cost[0, 0]
    cost[0, 1:] = np.cumsum(dist_matrix[0, 1:]) + cost[0, 0]

    for i in range(1, N):
        for j in range(1, M):
            cost[i, j] = dist_matrix[i, j] + min(cost[i - 1, j], cost[i, j - 1], cost[i - 1, j - 1])

    i, j = N - 1, M - 1
    mapping = {i: j}

    while i > 0 or j > 0:
        if i == 0:
            j -= 1
        elif j == 0:
            i -= 1
        else:
            prev_costs = [cost[i - 1, j - 1], cost[i - 1, j], cost[i, j - 1]]
            choice = np.argmin(prev_costs)
            if choice == 0:
                i, j = i - 1, j - 1
            elif choice == 1:
                i -= 1
            else:
                j -= 1
        mapping[i] = j

    return mapping


# --- КЛАС ДЛЯ ОБРОБКИ ПОТОКУ ВЕБ-КАМЕРИ В REAL-TIME ---
class PoseVideoProcessor(VideoProcessorBase):
    def __init__(self):
        self.pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
        self.ref_angles = None
        self.active_indices = [2, 3, 4, 5]
        self.last_matched_ref_idx = 0
        self.error_threshold = 25.0

        # Статистика
        self.total_frames = 0
        self.error_frames = 0
        self.diffs_history = []

    def set_reference_data(self, ref_angles, active_indices):
        self.ref_angles = np.array(ref_angles)
        self.active_indices = active_indices
        self.last_matched_ref_idx = 0
        self.total_frames = 0
        self.error_frames = 0
        self.diffs_history = []

    def recv(self, frame):
        img = frame.to_ndarray(format="bgr24")
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        res = self.pose.process(rgb)

        if res.pose_landmarks and self.ref_angles is not None:
            current_angles = extract_key_angles(res.pose_landmarks.landmark)
            p_sub = np.array(current_angles)[self.active_indices]

            # Пошук найбільш відповідного кадру з еталону (Online Matching у локальному вікні)
            search_window_start = max(0, self.last_matched_ref_idx)
            search_window_end = min(len(self.ref_angles), self.last_matched_ref_idx + 15)

            ref_sub_window = self.ref_angles[search_window_start:search_window_end, self.active_indices]

            if len(ref_sub_window) > 0:
                distances = np.linalg.norm(ref_sub_window - p_sub, axis=1)
                best_match_offset = np.argmin(distances)
                best_ref_idx = search_window_start + best_match_offset
                self.last_matched_ref_idx = best_ref_idx

                matched_ref = self.ref_angles[best_ref_idx][self.active_indices]
                angle_diffs = np.abs(p_sub - matched_ref)
                max_diff = np.max(angle_diffs)
                mean_diff = np.mean(angle_diffs)

                has_error = max_diff > self.error_threshold

                # Збір статистики
                self.total_frames += 1
                self.diffs_history.append(mean_diff)
                if has_error:
                    self.error_frames += 1

                color = (0, 255, 0) if not has_error else (0, 0, 255)
                mp_drawing.draw_landmarks(
                    img, res.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing.DrawingSpec(color=color, thickness=3, circle_radius=3)
                )

                status_text = f"OK ({int(max_diff)} deg)" if not has_error else f"ERROR! ({int(max_diff)} deg)"
                cv2.putText(img, status_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

        return frame.from_ndarray(img, format="bgr24")


st.title("🏋️ Rehab AI: Реальний час та аналіз техніки")

mode = st.sidebar.radio("Оберіть роль:", ["Лікар (Додати вправу)", "Пацієнт (Виконати вправу)"])

if mode == "Лікар (Додати вправу)":
    st.header("👨‍⚕️ Кабінет Лікаря")
    exercise_name = st.text_input("Назва вправи:", "Присідання")
    uploaded_file = st.file_uploader("Завантажте відео з правильною технікою", type=["mp4", "mov", "avi"])

    if uploaded_file:
        tfile = tempfile.NamedTemporaryFile(delete=False)
        tfile.write(uploaded_file.read())

        cap = cv2.VideoCapture(tfile.name)
        ret, first_frame = cap.read()
        cap.release()

        if ret:
            st.subheader("🎯 Крок 1: Візуальна розмітка суглобів")
            pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
            rgb_first = cv2.cvtColor(first_frame, cv2.COLOR_BGR2RGB)
            res_first = pose.process(rgb_first)

            annotated_frame = first_frame.copy()
            if res_first.pose_landmarks:
                h, w, _ = first_frame.shape
                lm = res_first.pose_landmarks.landmark

                joints_coords = {
                    0: lm[mp_pose.PoseLandmark.LEFT_ELBOW.value],
                    1: lm[mp_pose.PoseLandmark.RIGHT_ELBOW.value],
                    2: lm[mp_pose.PoseLandmark.LEFT_KNEE.value],
                    3: lm[mp_pose.PoseLandmark.RIGHT_KNEE.value],
                    4: lm[mp_pose.PoseLandmark.LEFT_HIP.value],
                    5: lm[mp_pose.PoseLandmark.RIGHT_HIP.value]
                }

                for j_id, pt in joints_coords.items():
                    cx, cy = int(pt.x * w), int(pt.y * h)
                    cv2.circle(annotated_frame, (cx, cy), 8, (0, 255, 255), -1)
                    cv2.putText(annotated_frame, f"ID:{j_id}", (cx + 10, cy + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                mp_drawing.draw_landmarks(annotated_frame, res_first.pose_landmarks, mp_pose.POSE_CONNECTIONS)

            st.image(cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB), caption="Перший кадр з розміткою суглобів")

            st.subheader("🎯 Крок 2: Оберіть суглоби, які є важливими для цієї вправи")
            selected_joints = st.multiselect(
                "Суглоби для контролю:",
                options=list(JOINTS_DICT.keys()),
                format_func=lambda x: f"[{x}] {JOINTS_DICT[x]}",
                default=[2, 3, 4, 5]
            )

            if st.button("Зберегти вправу та обробити весь еталон"):
                if not selected_joints:
                    st.error("Будь ласка, оберіть хоча б один суглоб!")
                else:
                    cap = cv2.VideoCapture(tfile.name)
                    pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
                    reference_angles = []

                    with st.spinner("Зчитування кутів з еталонного відео..."):
                        while cap.isOpened():
                            ret, frame = cap.read()
                            if not ret:
                                break
                            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            res = pose.process(rgb)
                            if res.pose_landmarks:
                                reference_angles.append(extract_key_angles(res.pose_landmarks.landmark))

                    cap.release()

                    data_to_save = {
                        "active_indices": selected_joints,
                        "angles": reference_angles
                    }

                    filename = f"{exercise_name.lower().replace(' ', '_')}_ref.json"
                    with open(filename, "w") as f:
                        json.dump(data_to_save, f)

                    st.success(f"Вправу '{exercise_name}' збережено! Вибрані ID суглобів: {selected_joints}")

elif mode == "Пацієнт (Виконати вправу)":
    st.header("🩹 Кабінет Пацієнта")
    json_files = [f for f in os.listdir(".") if f.endswith("_ref.json")]

    if not json_files:
        st.warning("Спочатку лікар має додати вправу!")
    else:
        selected_ex = st.selectbox("Оберіть вправу:", json_files)
        with open(selected_ex, "r") as f:
            data = json.load(f)

        ref_angles = np.array(data["angles"])
        active_indices = data.get("active_indices", [2, 3, 4, 5])
        st.info(f"Для цієї вправи перевіряються суглоби з ID: {active_indices}")

        # Вибір джерела: Веб-камера або Файл
        input_type = st.radio("Оберіть спосіб виконання:", ["📹 Веб-камера (Real-time)", "📁 Завантажити відеозапис"])

        if input_type == "📹 Веб-камера (Real-time)":
            st.subheader("🎥 Виконання вправи наживо")

            ctx = webrtc_streamer(
                key="rehab-realtime",
                rtc_configuration=RTC_CONFIGURATION,
                video_processor_factory=PoseVideoProcessor,
                media_stream_constraints={"video": True, "audio": False}
            )

            if ctx.video_processor:
                ctx.video_processor.set_reference_data(ref_angles, active_indices)

        else:
            patient_file = st.file_uploader("Завантажте ваше відео", type=["mp4", "mov", "avi"])

            if patient_file and st.button("Проаналізувати"):
                tfile = tempfile.NamedTemporaryFile(delete=False)
                tfile.write(patient_file.read())

                cap = cv2.VideoCapture(tfile.name)
                pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
                patient_angles_list = []
                frames = []

                with st.spinner("Аналіз руху та DTW-синхронізація..."):
                    while cap.isOpened():
                        ret, frame = cap.read()
                        if not ret:
                            break
                        frames.append(frame)
                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        res = pose.process(rgb)
                        if res.pose_landmarks:
                            patient_angles_list.append(
                                (extract_key_angles(res.pose_landmarks.landmark), res.pose_landmarks))
                        else:
                            patient_angles_list.append((None, None))

                cap.release()

                valid_patient_angles = [p[0] for p in patient_angles_list if p[0] is not None]

                if len(valid_patient_angles) > 0:
                    patient_matrix = np.array(valid_patient_angles)

                    dtw_patient_matrix = patient_matrix[:, active_indices]
                    dtw_ref_matrix = ref_angles[:, active_indices]

                    mapping = compute_dtw_mapping(dtw_patient_matrix, dtw_ref_matrix)

                    st_frame = st.empty()
                    error_threshold = 25.0

                    total_valid_frames = 0
                    error_frames_count = 0
                    all_mean_diffs = []

                    valid_idx = 0
                    for i, (p_angles, landmarks) in enumerate(patient_angles_list):
                        frame = frames[i]
                        if p_angles is not None and landmarks is not None:
                            ref_idx = mapping.get(valid_idx, 0)
                            matched_ref = ref_angles[ref_idx]

                            p_sub = np.array(p_angles)[active_indices]
                            ref_sub = np.array(matched_ref)[active_indices]

                            angle_diffs = np.abs(p_sub - ref_sub)
                            max_diff = np.max(angle_diffs) if len(angle_diffs) > 0 else 0
                            mean_diff = np.mean(angle_diffs) if len(angle_diffs) > 0 else 0

                            has_error = max_diff > error_threshold

                            total_valid_frames += 1
                            all_mean_diffs.append(mean_diff)
                            if has_error:
                                error_frames_count += 1

                            color = (0, 255, 0) if not has_error else (255, 0, 0)
                            mp_drawing.draw_landmarks(
                                frame, landmarks, mp_pose.POSE_CONNECTIONS,
                                landmark_drawing_spec=mp_drawing.DrawingSpec(color=color, thickness=3, circle_radius=3)
                            )

                            status_text = f"ОК ({int(max_diff)} deg diff)" if not has_error else f"Помилка! ({int(max_diff)} deg diff)"
                            cv2.putText(frame, status_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
                            valid_idx += 1

                        st_frame.image(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), channels="RGB")

                    st.success("Аналіз успішно завершено!")

                    st.markdown("---")
                    st.subheader("📊 Загальний звіт та рейтинг виконання")

                    if total_valid_frames > 0:
                        correct_frames_pct = ((total_valid_frames - error_frames_count) / total_valid_frames) * 100
                        avg_angle_error = np.mean(all_mean_diffs)

                        angle_penalty = min(avg_angle_error * 1.5, 40)
                        final_score = int(np.clip(correct_frames_pct - angle_penalty, 0, 100))

                        if final_score >= 85:
                            rating_label = "🏆 Відмінно!"
                            rating_color = "green"
                            advice = "Чудова техніка! Рух повністю відповідає еталону."
                        elif final_score >= 65:
                            rating_label = "👍 Добре"
                            rating_color = "orange"
                            advice = "Вправа виконана добре, але є незначні відхилення у кутах. Зверніть увагу на амплітуду."
                        else:
                            rating_label = "⚠️ Потребує доопрацювання"
                            rating_color = "red"
                            advice = "Виявлено значні відхилення від еталону. Повторіть вправу повільніше або зверніться до лікаря."

                        col1, col2, col3 = st.columns(3)
                        col1.metric("Підсумковий бал", f"{final_score} / 100")
                        col2.metric("Точність за кадрами", f"{correct_frames_pct:.1f}%")
                        col3.metric("Сер. відхилення", f"{avg_angle_error:.1f}°")

                        st.markdown(f"### Оцінка: :{rating_color}[{rating_label}]")
                        st.info(f"💡 **Порада:** {advice}")