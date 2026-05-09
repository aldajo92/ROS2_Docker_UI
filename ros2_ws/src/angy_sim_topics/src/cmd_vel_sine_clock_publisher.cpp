// Publish /cmd_vel commands from simulation time carried on /clock.
//
// The node deliberately does not use a wall timer: every incoming
// rosgraph_msgs/msg/Clock sample produces one Twist command, which keeps
// the command stream deterministic under simulation pause / resume and
// playback speed changes.

#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <string>

#include "geometry_msgs/msg/twist.hpp"
#include "rclcpp/rclcpp.hpp"
#include "rosgraph_msgs/msg/clock.hpp"

namespace angy_sim_topics
{

namespace
{

constexpr double kPi = 3.14159265358979323846;

double clamp_non_negative(double value)
{
  return std::max(0.0, value);
}

std::string fallback_if_empty(
  const std::string & value,
  const std::string & fallback)
{
  return value.empty() ? fallback : value;
}

double to_seconds(const builtin_interfaces::msg::Time & stamp)
{
  return static_cast<double>(stamp.sec) +
         static_cast<double>(stamp.nanosec) * 1e-9;
}

}  // namespace

class CmdVelSineClockPublisher : public rclcpp::Node
{
public:
  CmdVelSineClockPublisher()
  : rclcpp::Node("cmd_vel_sine_clock_publisher")
  {
    linear_velocity_mps_ =
      this->declare_parameter<double>("linear_velocity_mps", 0.5);
    angular_amplitude_radps_ =
      clamp_non_negative(
      this->declare_parameter<double>("angular_amplitude_radps", 1.0));
    frequency_hz_ =
      clamp_non_negative(this->declare_parameter<double>("frequency_hz", 0.2));

    const std::string cmd_vel_topic =
      fallback_if_empty(
      this->declare_parameter<std::string>("cmd_vel_topic", "cmd_vel"),
      "cmd_vel");
    const std::string clock_topic =
      fallback_if_empty(
      this->declare_parameter<std::string>("clock_topic", "/clock"),
      "/clock");

    cmd_vel_publisher_ =
      this->create_publisher<geometry_msgs::msg::Twist>(cmd_vel_topic, 10);
    clock_subscription_ =
      this->create_subscription<rosgraph_msgs::msg::Clock>(
      clock_topic,
      10,
      std::bind(&CmdVelSineClockPublisher::on_clock, this, std::placeholders::_1));

    RCLCPP_INFO(
      this->get_logger(),
      "cmd_vel_sine_clock_publisher up: publishing '%s' from '%s' "
      "(linear=%.3f m/s, angular_amplitude=%.3f rad/s, frequency=%.3f Hz)",
      cmd_vel_topic.c_str(),
      clock_topic.c_str(),
      linear_velocity_mps_,
      angular_amplitude_radps_,
      frequency_hz_);
  }

private:
  void on_clock(const rosgraph_msgs::msg::Clock::SharedPtr msg)
  {
    const double current_time_sec = to_seconds(msg->clock);
    if (!has_first_clock_time_) {
      first_clock_time_sec_ = current_time_sec;
      has_first_clock_time_ = true;
    }

    const double t = current_time_sec - first_clock_time_sec_;

    geometry_msgs::msg::Twist cmd;
    cmd.linear.x = linear_velocity_mps_;
    cmd.angular.z =
      angular_amplitude_radps_ * std::sin(2.0 * kPi * frequency_hz_ * t);

    cmd_vel_publisher_->publish(cmd);
  }

  rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmd_vel_publisher_;
  rclcpp::Subscription<rosgraph_msgs::msg::Clock>::SharedPtr clock_subscription_;
  double linear_velocity_mps_{0.5};
  double angular_amplitude_radps_{1.0};
  double frequency_hz_{0.2};
  double first_clock_time_sec_{0.0};
  bool has_first_clock_time_{false};
};

}  // namespace angy_sim_topics

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<angy_sim_topics::CmdVelSineClockPublisher>());
  rclcpp::shutdown();
  return 0;
}
